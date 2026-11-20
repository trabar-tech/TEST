/**
 * One shift's worth of consequences, in one place (P4-T04 groundwork).
 *
 * This exists because the browser and the headless campaign runner must not be able to
 * disagree about what a shift *does*. Before this module, `main.ts` owned the sequence —
 * age the record, clear the docket, advance the sector, decay grudges, re-draw orders —
 * and any simulation that did not re-implement it would have measured a different game
 * than the one people play. Duplicated ordering is the bug class this project has already
 * been bitten by twice (see AGENTS.md, "the ordering trap").
 *
 * Deliberately pure-ish and DOM-free: it takes state and content and returns the next
 * state. The runner and the browser both call it; neither owns it.
 */

import type { Directive, Storylet } from '@core/content';
import type { Simulation } from './shift';
import { decayGrudges } from './plans';
import { nextShift as advanceSector } from './sector';

export interface CycleResult {
  shift: number;
  /** the sector memory after decay, for the briefing and the HUD */
  sector: ReturnType<typeof advanceSector>['memory'];
  /** directives in force for the new shift */
  directives: Directive[];
  /** epilogues whose scheduled shift has come due, in draw order */
  dueEpilogues: Storylet[];
  /** grudges that survived their decay rule */
  grudges: number;
}

/**
 * Tonight's standing orders (P3-T11).
 *
 * The sample bundle ships twenty-two of them, and the desk charges the Warden for obeying
 * two that cannot both be satisfied. Selecting by shift keeps it deterministic. The
 * declared pair is the point: the shift that draws the first half always draws the second,
 * so the contradiction is a turn of the screw rather than the weather.
 */
export function ordersForShift(directives: readonly Directive[], shift: number): Directive[] {
  if (directives.length === 0) return [];
  const start = ((shift - 1) * 3) % directives.length;
  const picked = [0, 1, 2].map((i) => directives[(start + i) % directives.length]!);
  const partner = picked
    .flatMap((d) => d.contradicts)
    .map((id) => directives.find((d) => d.id === id))
    .filter((d): d is Directive => d !== undefined && !picked.includes(d));
  return [...picked, ...partner];
}

export interface AdvanceOptions {
  directives: readonly Directive[];
  epilogues: readonly Storylet[];
  /** set false to skip force decay (the playlist's "hold the ratchet" mode) */
  decay?: boolean;
}

/**
 * Advance the campaign by one shift and return everything the caller needs to show and
 * install. Mutates the simulation in exactly the ways a shift boundary requires — and
 * nowhere else, so a headless run and a played run produce the same state.
 */
export function advanceShift(sim: Simulation, opts: AdvanceOptions): CycleResult {
  sim.record.age();
  sim.docket.length = 0;
  sim.inspectionsDone = 0;
  sim.state.shift += 1;

  const directives = ordersForShift(opts.directives, sim.state.shift);
  sim.setDirectives(directives);

  const sector = advanceSector(sim.state, opts.decay === undefined ? {} : { decay: opts.decay });
  sim.grudges = decayGrudges(sim.grudges, sim.state.shift);

  // an epilogue scheduled for shift N comes due at the *start* of shift N, so the player
  // meets it before doing anything that shift — a consequence, not a footnote
  const dueEpilogues = opts.epilogues.filter((e) =>
    (sim.effectState.scheduled ?? []).some((s) => s.id === e.id && s.dueShift <= sim.state.shift),
  );

  return {
    shift: sim.state.shift,
    sector: sector.memory,
    directives,
    dueEpilogues,
    grudges: sim.grudges.length,
  };
}
