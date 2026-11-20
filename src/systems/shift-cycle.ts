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
import type { FiledAct } from './household-reaction';

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

/**
 * Every act the district will be charged for tonight, captured in one place.
 *
 * This function exists because the same bug was written twice: once in `main.ts` and once
 * in the campaign runner, both times by reacting to the record *before* `submit()` had
 * written the lines the Warden left blank. Copying the correct sequence into a second
 * caller simply produced a second, subtly wrong caller. The sequence now lives here, and
 * callers pass in the docket and both line sets rather than re-deriving them.
 *
 * Order matters: an auto-filed line is as real to the household behind the door as one
 * written by hand, and `submit()` is the only reason a blank becomes a line at all.
 */
export function collectActs(
  docket: ReadonlyArray<{ ref: string; edge?: { household_id: string } | null }>,
  filed: ReadonlyArray<{ event_ref: string; claim: { classification: string; force_rung?: number } }>,
  autoFiled: ReadonlyArray<{ event_ref: string; claim: { classification: string; force_rung?: number } }>,
): FiledAct[] {
  const byRef = new Map(docket.map((e) => [e.ref, e.edge?.household_id]));
  const acts: FiledAct[] = [];
  const seen = new Set<string>();

  for (const line of [...filed, ...autoFiled]) {
    // an auto-filed line and a hand-written one cannot both exist for the same event
    // (submit() skips anything already filed), but dedupe anyway: double-charging a
    // household is a bug that looks like a balance problem
    if (seen.has(line.event_ref)) continue;
    seen.add(line.event_ref);
    const household_id = byRef.get(line.event_ref);
    if (!household_id) continue;
    acts.push({
      household_id,
      classification: line.claim.classification as FiledAct['classification'],
      force_rung: line.claim.force_rung,
    });
  }
  return acts;
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
