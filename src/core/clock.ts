/**
 * Fixed-timestep clock with timescale support.
 *
 * Design (TECH-01 §4, P0-T06):
 *  - The simulation always advances in whole `STEP`s of fixed `dt`.
 *  - Timescale multiplies how much *real* time is consumed per step; it never
 *    changes `dt`. A naive `dt *= 0.35` breaks determinism across pause/plan/
 *    focus because the step size becomes non-reproducible.
 *  - Mode changes are *queued* and applied at a step boundary, so a step can
 *    never observe a timescale change halfway through.
 *  - Slow-mo must not lose sim time: the residual carry is preserved, and for
 *    fractional multipliers we advance every Nth step using an accumulator in
 *    "step units".
 */

export const STEP_MS = 1000 / 60;
export const STEP_SEC = 1 / 60;

export type TimeMode = 'patrol' | 'pause' | 'plan' | 'focus' | 'brief';

export const TIMESCALES: Record<TimeMode, number> = {
  patrol: 1.0,
  pause: 0.0,
  plan: 0.15,
  focus: 0.35,
  brief: 0.0,
};

export interface ClockOptions {
  /** called once per fixed step; `dt` is always STEP_SEC */
  step: (dt: number, tick: number) => void;
  mode?: TimeMode;
  /**
   * Safety valve: if the tab was backgrounded, realDt can be huge. Cap the
   * number of catch-up steps per frame so we don't spiral.
   */
  maxStepsPerFrame?: number;
  now?: () => number;
}

export class Clock {
  private readonly stepFn: (dt: number, tick: number) => void;
  private readonly now: () => number;
  private readonly maxStepsPerFrame: number;

  private lastNow = 0;
  private running = false;
  /** longest single frame we will believe, in ms */
  private readonly maxFrameMs = 250;

  /** leftover real-time, in STEP units, scaled by timescale */
  private acc = 0;
  /** current mode, and the mode to apply at the next step boundary */
  private _mode: TimeMode;
  private queuedMode: TimeMode | null = null;

  /** integer tick counter; part of the save */
  tick = 0;
  /** total sim-seconds elapsed (drives the in-fiction shift clock) */
  simSeconds = 0;

  constructor(opts: ClockOptions) {
    this.stepFn = opts.step;
    this.now = opts.now ?? (() => performance.now());
    this.maxStepsPerFrame = opts.maxStepsPerFrame ?? 5;
    this._mode = opts.mode ?? 'patrol';
  }

  /** The mode in effect for the current step. Mode changes land at boundaries. */
  get mode(): TimeMode {
    return this._mode;
  }

  /** The mode that will take effect at the next step boundary (may equal mode). */
  get pendingMode(): TimeMode {
    return this.queuedMode ?? this._mode;
  }

  get timescale(): number {
    return TIMESCALES[this._mode];
  }

  /** Queue a mode change; it lands at the next step boundary. */
  setMode(mode: TimeMode): void {
    if (mode === this._mode) {
      this.queuedMode = null;
      return;
    }
    this.queuedMode = mode;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = this.now();
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Advance by an explicit amount of real time (ms). Tests use this; the
   * render loop uses `frame()` with the wall clock.
   */
  advanceRealMs(realMs: number): number {
    const steps = this.computeSteps(realMs);
    if (steps > 0) this.runSteps(steps);
    return steps;
  }

  /** Call once per animation frame. Returns how many sim steps ran. */
  frame(): number {
    if (!this.running) {
      this.lastNow = this.now();
      return 0;
    }
    const t = this.now();
    // A frame longer than this is not a slow frame, it is a stalled tab or a
    // debugger pause. Banking it would rewind the fiction by seconds.
    const realMs = Math.min(this.maxFrameMs, Math.max(0, t - this.lastNow));
    this.lastNow = t;
    const steps = this.computeSteps(realMs);
    if (steps > 0) this.runSteps(steps);
    return steps;
  }

  /**
   * Apply a queued mode change. Called both before a frame consumes real time
   * and at each step boundary.
   *
   * Before-the-frame matters: if the player hits pause, the elapsed real time
   * of that frame belongs to the paused interval, not to patrol speed.
   * Otherwise clicking pause would fast-forward up to a second of simulation.
   */
  private flushQueuedMode(): void {
    if (this.queuedMode === null || this.queuedMode === this._mode) {
      this.queuedMode = null;
      return;
    }
    this._mode = this.queuedMode;
    this.queuedMode = null;
    // a zero timescale must not bank time that reappears on unpause
    if (TIMESCALES[this._mode] <= 0) this.acc = 0;
  }

  private computeSteps(realMs: number): number {
    this.flushQueuedMode();
    // Deliberately the *applied* timescale, not the pending one: scaling with a
    // mode that has not started yet would let a queued slow-mo consume real
    // time that then runs at full speed.
    const scale = TIMESCALES[this._mode];
    if (scale <= 0) {
      // Paused: consume no time at all (so unpausing doesn't fast-forward).
      this.acc = 0;
      return 0;
    }
    this.acc += (realMs / STEP_MS) * scale;
    const steps = Math.min(Math.floor(this.acc), this.maxStepsPerFrame);
    this.acc -= steps;
    return steps;
  }

  private runSteps(n: number): void {
    for (let i = 0; i < n; i++) {
      // a step function may call setMode(); honour it at the boundary, never
      // inside the step that requested it
      this.flushQueuedMode();
      this.tick += 1;
      this.simSeconds += STEP_SEC;
      this.stepFn(STEP_SEC, this.tick);
    }
  }

  /** Snapshot for saves/replays. */
  snapshot(): { tick: number; simSeconds: number; mode: TimeMode; acc: number } {
    return { tick: this.tick, simSeconds: this.simSeconds, mode: this._mode, acc: this.acc };
  }

  restore(s: { tick: number; simSeconds: number; mode: TimeMode; acc?: number }): void {
    this.tick = s.tick;
    this.simSeconds = s.simSeconds;
    this._mode = s.mode;
    this.queuedMode = null;
    this.acc = s.acc ?? 0;
  }
}
