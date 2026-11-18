import { describe, expect, it } from 'vitest';
import { Clock, STEP_MS, STEP_SEC, TIMESCALES } from '@core/clock';

/**
 * Tests care about time accounting, not the tab-backgrounded spiral-of-death
 * guard, so they lift the per-frame cap. The cap has its own test below.
 */
function makeClock(mode: 'patrol' | 'pause' | 'plan' | 'focus' | 'brief' = 'patrol') {
  const dts: number[] = [];
  let ticks = 0;
  const clock = new Clock({
    mode,
    maxStepsPerFrame: 100_000,
    step: (dt, tick) => {
      dts.push(dt);
      ticks = tick;
    },
  });
  return { clock, dts, ticks: () => ticks };
}

describe('clock', () => {
  it('always steps with a fixed dt', () => {
    const { clock, dts } = makeClock();
    clock.advanceRealMs(1000);
    expect(dts.length).toBeGreaterThan(50);
    expect(new Set(dts)).toEqual(new Set([STEP_SEC]));
  });

  it('advances one step per 16.67ms at timescale 1', () => {
    const { clock, dts } = makeClock();
    clock.advanceRealMs(STEP_MS * 10);
    expect(dts.length).toBe(10);
  });

  it('accumulates fractional remainders instead of dropping them', () => {
    const { clock } = makeClock();
    // 3 frames of 0.5 steps worth of time = 1.5 steps → 1 step, keep 0.5
    clock.advanceRealMs(STEP_MS * 0.5);
    clock.advanceRealMs(STEP_MS * 0.5);
    expect(clock.tick).toBe(1);
    clock.advanceRealMs(STEP_MS * 0.5);
    expect(clock.tick).toBe(1); // 0.5 residual → still under 1
    clock.advanceRealMs(STEP_MS * 0.5);
    expect(clock.tick).toBe(2);
  });

  it('slow-mo does not lose sim time', () => {
    // Real frames, not one giant advance: the clock deliberately caps catch-up
    // steps per frame (spiral-of-death guard), so a single 60s call would only
    // ever produce `maxStepsPerFrame` ticks. 60s at 60fps is the honest test.
    const frames = 3600;
    const focused = makeClock('focus');
    const normal = makeClock('patrol');
    for (let i = 0; i < frames; i++) {
      focused.clock.advanceRealMs(STEP_MS);
      normal.clock.advanceRealMs(STEP_MS);
    }
    expect(normal.clock.tick).toBe(frames);
    const ratio = focused.clock.tick / normal.clock.tick;
    expect(ratio).toBeGreaterThan(0.34);
    expect(ratio).toBeLessThan(0.36);
  });

  it('pause consumes no time and does not fast-forward on unpause', () => {
    const { clock } = makeClock();
    clock.advanceRealMs(STEP_MS * 5);
    const before = clock.tick;
    clock.setMode('pause');
    clock.advanceRealMs(10_000);
    expect(clock.tick).toBe(before);
    clock.setMode('patrol');
    clock.advanceRealMs(STEP_MS);
    expect(clock.tick).toBe(before + 1);
  });

  it('applies mode changes only at step boundaries', () => {
    // a step must never observe a timescale change mid-step: we detect that by
    // checking that dt is constant even when the mode changes between frames
    const seen: number[] = [];
    let modes: string[] = [];
    const clock = new Clock({
      step: (dt) => {
        seen.push(dt);
        modes.push(clock.mode);
      },
    });
    clock.advanceRealMs(STEP_MS * 3);
    clock.setMode('focus');
    clock.advanceRealMs(STEP_MS * 3);
    clock.setMode('patrol');
    clock.advanceRealMs(STEP_MS * 3);
    expect(new Set(seen).size).toBe(1);
    modes = [...new Set(modes)];
    expect(modes).toContain('patrol');
  });

  it('survives repeated mode thrashing without drift', () => {
    // Two invariants, both cheap to state and hard to fake:
    //  1. a control run pinned at patrol converts frames to ticks 1:1 with no
    //     drift (the accumulator never leaks);
    //  2. thrashing the mode can only ever *discard* time (on entering pause),
    //     never invent it.
    const sequence: Array<'patrol' | 'pause' | 'focus' | 'plan'> = [
      'patrol',
      'pause',
      'focus',
      'plan',
    ];
    const run = (thrash: boolean) => {
      const { clock } = makeClock();
      for (let i = 0; i < 400; i++) {
        if (thrash) clock.setMode(sequence[i % sequence.length]!);
        clock.advanceRealMs(STEP_MS);
        // sim seconds and ticks must never disagree
        expect(clock.simSeconds).toBeCloseTo(clock.tick * STEP_SEC, 9);
      }
      return clock.tick;
    };
    const control = run(false);
    expect(control).toBe(400);
    expect(run(true)).toBeGreaterThan(0);
    expect(run(true)).toBeLessThanOrEqual(control);
  });

  it('caps catch-up steps to avoid a spiral of death', () => {
    const dts: number[] = [];
    const clock = new Clock({ step: (dt) => dts.push(dt) }); // default cap
    clock.advanceRealMs(STEP_MS * 1000); // tab was backgrounded
    expect(dts.length).toBe(5); // maxStepsPerFrame default
  });

  it('snapshots and restores', () => {
    const { clock } = makeClock();
    clock.advanceRealMs(STEP_MS * 12);
    const snap = clock.snapshot();
    const other = makeClock();
    other.clock.restore(snap);
    expect(other.clock.tick).toBe(snap.tick);
    expect(other.clock.simSeconds).toBe(snap.simSeconds);
  });
});
