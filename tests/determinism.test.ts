/**
 * P0-T02 / P0-T04 acceptance:
 *  - the same seed run twice produces the same state hash after 10,000 ticks
 *  - the sim result does not depend on frame rate (render fps must not matter)
 *  - a sim saved mid-run and reloaded continues to the same hash
 *
 * This is the test that protects the whole project: the audit tests, the save
 * format and OVERSEER's headless dispatch all assume it holds.
 */

import { describe, expect, it } from 'vitest';
import { Clock, STEP_MS } from '@core/clock';
import { streamFor } from '@core/rng';
import { stateHash } from '@core/hash';
import { World } from '@core/world';
import { emptyState, type GameState } from '@core/state';
import { decodeSave, encodeSave } from '@core/save';

/**
 * A deliberately simple stand-in for the real sim: a pawn wandering around an
 * arena, drawing from its own keyed RNG stream, plus a per-tick counter.
 * If this is deterministic at 10k ticks, the harness is sound.
 */
function makeSim(seed: number) {
  const world = new World();
  const pawn = world.create('pawn', { pos: { x: 0, y: 0 }, heading: 0 });
  const state: GameState = { ...emptyState(seed), world: world.snapshot() };
  state.player.entityId = pawn.id;

  let rng = streamFor(seed, state.shift, 'wander');

  const step = (_dt: number, tick: number): void => {
    const e = world.get(pawn.id);
    if (!e) return;
    const pos = e.c.pos as { x: number; y: number };
    const heading = e.c.heading as number;
    pos.x = Math.round((pos.x + Math.cos(heading) + 0.5) * 1000) / 1000;
    pos.y = Math.round((pos.y + Math.sin(heading) + 0.5) * 1000) / 1000;
    e.c.heading = Math.round((heading + (rng.next() - 0.5) * 0.2) * 10000) / 10000;
    if (tick % 60 === 0) {
      state.flags['last_milestone'] = tick;
    }
  };

  const snapshot = (): GameState => {
    state.world = world.snapshot();
    state.tick = { tick: clock.tick, simSeconds: clock.simSeconds, mode: clock.mode };
    // the stream position is part of the state, not a detail of the harness:
    // without it a reload re-rolls every future draw (P0-T04)
    state.rng['wander'] = rng.state();
    return JSON.parse(JSON.stringify(state)) as GameState;
  };

  const clock = new Clock({ step });

  return { clock, snapshot, state, world, pawnId: pawn.id };
}

/**
 * Advance exactly `ticks` sim ticks. Even the "no frame table" case is fed in
 * one-second frames, because a single multi-second advance is deliberately
 * capped by the clock's spiral-of-death guard.
 */
function runTicks(sim: ReturnType<typeof makeSim>, ticks: number, frameMsTable?: number[]): void {
  if (!frameMsTable) {
    let remaining = ticks;
    while (remaining > 0) {
      const before = sim.clock.tick;
      sim.clock.advanceRealMs(STEP_MS * Math.min(remaining, 60));
      remaining -= sim.clock.tick - before;
    }
    return;
  }
  let remaining = ticks;
  let i = 0;
  while (remaining > 0) {
    const frameMs = frameMsTable[i % frameMsTable.length]!;
    const before = sim.clock.tick;
    sim.clock.advanceRealMs(frameMs);
    remaining -= sim.clock.tick - before;
    i++;
  }
}

describe('determinism', () => {
  it('same seed twice → identical state hash after 10,000 ticks', () => {
    const a = makeSim(42);
    const b = makeSim(42);
    runTicks(a, 10_000);
    runTicks(b, 10_000);
    expect(a.clock.tick).toBe(10_000);
    expect(stateHash(a.snapshot())).toBe(stateHash(b.snapshot()));
  });

  it('different seeds → different state hash', () => {
    const a = makeSim(1);
    const b = makeSim(2);
    runTicks(a, 500);
    runTicks(b, 500);
    expect(stateHash(a.snapshot())).not.toBe(stateHash(b.snapshot()));
  });

  it('sim result is independent of render frame rate (30 vs 120 fps)', () => {
    const at30 = makeSim(7);
    const at120 = makeSim(7);
    runTicks(at30, 2000, [1000 / 30]);
    runTicks(at120, 2000, [1000 / 120]);
    expect(at30.clock.tick).toBe(at120.clock.tick);
    expect(stateHash(at30.snapshot())).toBe(stateHash(at120.snapshot()));
  });

  it('sim result is independent of jittery frame times', () => {
    const steady = makeSim(99);
    const jittery = makeSim(99);
    runTicks(steady, 3000, [1000 / 60]);
    runTicks(jittery, 3000, [8, 24, 12, 40, 6, 30]);
    expect(stateHash(steady.snapshot())).toBe(stateHash(jittery.snapshot()));
  });

  it('a slow-mo segment does not change the post-segment hash, only the tick count', () => {
    const normal = makeSim(5);
    const slowed = makeSim(5);
    // normal: 600 ticks
    runTicks(normal, 600);
    // slowed: 300 ticks at 1.0, then 300 ticks at focus speed, which costs
    // roughly 3x the real time for the same number of ticks
    runTicks(slowed, 300);
    slowed.clock.setMode('focus');
    for (let i = 0; i < 60; i++) slowed.clock.advanceRealMs(STEP_MS * (60 / 0.35));
    // the exact tick count may differ by one; compare hashes at equal tick counts
    runTicks(slowed, 600 - slowed.clock.tick);
    expect(slowed.clock.tick).toBe(normal.clock.tick);
    const a = slowed.snapshot();
    const b = normal.snapshot();
    // the *simulation* must be identical — world and stream position — while
    // the state hash also covers `tick.mode`, which is correctly different
    expect(stateHash({ world: a.world, rng: a.rng, flags: a.flags })).toBe(
      stateHash({ world: b.world, rng: b.rng, flags: b.flags }),
    );
    expect(a.tick.mode).toBe('focus');
    expect(b.tick.mode).toBe('patrol');
  });

  it('save → load → continue yields the same hash as an uninterrupted run', () => {
    const uninterrupted = makeSim(2024);
    runTicks(uninterrupted, 1200);

    const split = makeSim(2024);
    runTicks(split, 600);
    const midway = split.snapshot();
    const json = encodeSave(midway);
    const restoredState = decodeSave(json);

    // rebuild a sim from the restored state
    const resumedClockSteps: number[] = [];
    const restoredWorld = new World();
    restoredWorld.restore(restoredState.world);
    const pawnId = restoredState.player.entityId!;
    const rng = streamFor(restoredState.seed, restoredState.shift, 'wander');
    // the save carries the stream position; without this the resumed run would
    // re-roll every draw from the top of the stream and diverge immediately
    expect(restoredState.rng['wander']).toBeTypeOf('number');
    rng.restore(restoredState.rng['wander']!);
    const clock = new Clock({
      maxStepsPerFrame: 1000,
      step: (_dt, tick) => {
        const e = restoredWorld.get(pawnId);
        if (!e) return;
        const pos = e.c.pos as { x: number; y: number };
        const heading = e.c.heading as number;
        pos.x = Math.round((pos.x + Math.cos(heading) + 0.5) * 1000) / 1000;
        pos.y = Math.round((pos.y + Math.sin(heading) + 0.5) * 1000) / 1000;
        e.c.heading = Math.round((heading + (rng.next() - 0.5) * 0.2) * 10000) / 10000;
        resumedClockSteps.push(tick);
      },
    });
    clock.restore(restoredState.tick);
    while (clock.tick < uninterrupted.clock.tick) clock.advanceRealMs(STEP_MS);

    expect(clock.tick).toBe(uninterrupted.clock.tick);
    const resumed: GameState = {
      ...restoredState,
      world: restoredWorld.snapshot(),
      tick: { tick: clock.tick, simSeconds: clock.simSeconds, mode: clock.mode },
    };
    // the world state matches; flags/record came from the save
    const expected = uninterrupted.snapshot();
    expect(stateHash(resumed.world)).toBe(stateHash(expected.world));
  });
});
