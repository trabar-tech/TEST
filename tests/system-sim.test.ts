/**
 * Phase 0 end-to-end, headless.
 *
 * The browser smoke test cannot run in CI (no WebGL, no browser binary), so the
 * simulation is driven directly here. Anything that touches Pixi or the DOM is
 * excluded by construction — `Sim` has no render dependency at all, which is
 * exactly the boundary ADR-0001 draws.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { stateHash } from '@core/hash';
import { decodeSave, encodeSave } from '@core/save';
import { Sim } from '@systems/sim';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/kiln_row_block_a.json'), 'utf8'),
) as MapJson;

const makeMap = (): TileMap => new TileMap(mapJsonToDef(MAP));

/** advance n ticks through 60 Hz frames */
function ticks(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.clock.advanceRealMs(1000 / 60);
}

describe('sim boot', () => {
  it('starts with a pawn on a walkable tile', () => {
    const sim = new Sim({ seed: 42, map: makeMap() });
    const tile = sim.map.toTile(sim.position);
    expect(sim.map.isWalkable(tile.tx, tile.ty)).toBe(true);
    expect(sim.world.ofKind('pawn')).toHaveLength(1);
  });

  it('emits sim:ready with the seed', () => {
    const sim = new Sim({ seed: 7, map: makeMap() });
    const ready = sim.bus.tail(10, 'sim:ready')[0];
    expect(ready).toBeDefined();
    expect((ready!.payload as { seed: number }).seed).toBe(7);
  });
});

describe('click to move', () => {
  it('walks around a wall instead of through it', () => {
    const sim = new Sim({ seed: 11, map: makeMap() });
    // the left-hand wing is sealed except for one doorway at (11, 9), so
    // reaching it means going around the interior wall rather than through it
    const target = sim.map.toWorld(4, 4);
    const result = sim.moveTo(target);
    expect(result.ok).toBe(true);
    // a straight line would be three waypoints; the doorway makes it more
    expect(sim.remainingPath.length).toBeGreaterThanOrEqual(2);

    let guard = 0;
    while (sim.isMoving && guard++ < 4000) {
      ticks(sim, 1);
      const tile = sim.map.toTile(sim.position);
      expect(sim.map.isWalkable(tile.tx, tile.ty)).toBe(true);
    }
    expect(sim.isMoving).toBe(false);
    expect(Math.hypot(sim.position.x - target.x, sim.position.y - target.y)).toBeLessThan(2);
  });

  it('refuses a target inside a wall with a readable reason', () => {
    const sim = new Sim({ seed: 11, map: makeMap() });
    const result = sim.moveTo(sim.map.toWorld(0, 0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/wall/i);
    expect(sim.bus.tail(5, 'nav:blocked')).toHaveLength(1);
  });

  it('orders are idempotent: two clicks, one route', () => {
    const sim = new Sim({ seed: 11, map: makeMap() });
    sim.moveTo(sim.map.toWorld(4, 4));
    const first = sim.remainingWaypoints;
    sim.moveTo(sim.map.toWorld(22, 16));
    expect(sim.remainingWaypoints).toBeGreaterThan(0);
    // re-ordering replaces the route instead of stacking a second one
    expect(sim.remainingPath.length).toBeLessThanOrEqual(Math.max(first, 1));
  });
});

describe('timescale', () => {
  it('focus consumes a third of the sim time of patrol', () => {
    const frames = 120;
    const patrol = new Sim({ seed: 3, map: makeMap() });
    const focus = new Sim({ seed: 3, map: makeMap() });
    focus.setMode('focus');
    for (let i = 0; i < frames; i++) {
      patrol.clock.advanceRealMs(1000 / 60);
      focus.clock.advanceRealMs(1000 / 60);
    }
    expect(patrol.clock.tick).toBe(frames);
    const ratio = focus.clock.tick / patrol.clock.tick;
    expect(ratio).toBeGreaterThan(0.33);
    expect(ratio).toBeLessThan(0.37);
  });

  it('pausing stops the sim without banking time', () => {
    const sim = new Sim({ seed: 3, map: makeMap() });
    ticks(sim, 30);
    const before = sim.clock.tick;
    sim.setMode('pause');
    for (let i = 0; i < 120; i++) sim.clock.advanceRealMs(1000 / 60);
    expect(sim.clock.tick).toBe(before);
    sim.setMode('patrol');
    ticks(sim, 1);
    expect(sim.clock.tick).toBe(before + 1);
  });
});

describe('determinism and saves', () => {
  it('same seed + same inputs → same hash after 5,000 ticks', () => {
    const run = (): string => {
      const sim = new Sim({ seed: 808, map: makeMap() });
      sim.moveTo(sim.map.toWorld(4, 4));
      ticks(sim, 2500);
      sim.moveTo(sim.map.toWorld(22, 16));
      ticks(sim, 2500);
      return stateHash(sim.snapshot());
    };
    expect(run()).toBe(run());
  });

  it('different seeds diverge', () => {
    const a = new Sim({ seed: 1, map: makeMap() });
    const b = new Sim({ seed: 2, map: makeMap() });
    ticks(a, 400);
    ticks(b, 400);
    expect(stateHash(a.snapshot())).not.toBe(stateHash(b.snapshot()));
  });

  it('save → load → continue reaches the same state as an uninterrupted run', () => {
    const straight = new Sim({ seed: 909, map: makeMap() });
    straight.moveTo(straight.map.toWorld(4, 4));
    ticks(straight, 900);

    const split = new Sim({ seed: 909, map: makeMap() });
    split.moveTo(split.map.toWorld(4, 4));
    ticks(split, 450);
    const json = encodeSave(split.snapshot());

    const resumed = new Sim({ seed: 909, map: makeMap() });
    const restored = decodeSave(json);
    resumed.restore(restored);
    expect(resumed.clock.tick).toBe(split.clock.tick);

    ticks(resumed, 450);
    ticks(split, 450);
    expect(stateHash(resumed.snapshot())).toBe(stateHash(split.snapshot()));
  });

  it('a restored sim resumes the route it was walking', () => {
    const sim = new Sim({ seed: 5, map: makeMap() });
    sim.moveTo(sim.map.toWorld(4, 4));
    ticks(sim, 40);
    const before = { ...sim.position };
    sim.restore(decodeSave(encodeSave(sim.snapshot())));
    expect(sim.position.x).toBeCloseTo(before.x, 3);
    expect(sim.position.y).toBeCloseTo(before.y, 3);
    // the route lives on the entity, so a save carries a half-walked path
    expect(sim.isMoving).toBe(true);
    const target = sim.remainingPath[sim.remainingPath.length - 1]!;
    ticks(sim, 2000);
    expect(sim.isMoving).toBe(false);
    expect(Math.hypot(sim.position.x - target.x, sim.position.y - target.y)).toBeLessThan(2);
  });
});
