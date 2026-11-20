/**
 * The headless campaign runner (P4-T04, entry criterion).
 *
 * Phase 4's own entry criteria name this the single most valuable tool of the phase, and
 * they are right: you cannot tune a fifteen-shift curve by playing fifteen shifts by hand
 * and writing numbers down. Every claim Phase 4 wants to make — "a player who never lies
 * can afford rent in Act I and barely in Act II", "all five endings are reachable", "no
 * dead ends" — is a claim about the *distribution* of runs, not about one run.
 *
 * The design constraint that matters: the runner must not re-implement the game. It
 * drives the same `Simulation`, the same audit, the same deck and the same
 * `advanceShift()` the browser calls, and it makes decisions through a **policy** object
 * rather than a script. A runner that replays a recorded script measures the script.
 *
 * It is deterministic per seed, which is what lets a tuning change be evaluated as a
 * before/after rather than as a vibe.
 */

import type { Directive, Storylet } from '@core/content';
import { streamFor } from '@core/rng';
import { Simulation } from './shift';
import { buildDeck } from './storylets';
import { advanceShift, collectActs } from './shift-cycle';
import { createSceneLog, pending, playResolution, sceneTotals, type SceneLogState } from './scene-log';
import { reactToFilings, harden } from './household-reaction';
import { chooseRecurrence } from './recurrence';
import { temperature, type SectorState } from './households';
import type { FaultVector } from './directors';
import type { AuditResult } from './audit';

export type PolicyName = 'honest' | 'cooperative' | 'ruthless' | 'absent';

export interface Policy {
  name: PolicyName;
  /** a falsifiable description, printed in the report so a reader can audit the run */
  intent: string;
  /** which resolution to take from a card, by authored resolution id order */
  chooseResolution(card: Storylet): string;
  /** the claim to stamp on an incident, or null to leave it blank (and be auto-filed) */
  incidentClaim(): 'P' | 'D' | 'NR' | 'X' | null;
  /** how many citizens this Warden actually inspects in a shift */
  inspectionsPerShift(): number;
  /** what to do about a citizen whose card did not hold up */
  inspectionOutcome(): { classification: 'P' | 'D' | 'R'; bribe?: boolean };
}

/**
 * Four policies that bracket the design's own claims.
 *
 * They are deliberately *simple and legible* — a policy whose behaviour cannot be
 * predicted on paper is a policy that cannot falsify anything. Each one is the shape of a
 * real player the design worries about.
 */
export const POLICIES: Record<PolicyName, Policy> = {
  honest: {
    name: 'honest',
    intent: 'files what happened, never overstates, takes the least-force option on cards',
    chooseResolution: (card) => card.resolutions[0]!.id,
    incidentClaim: () => 'P',
    inspectionsPerShift: () => 3,
    inspectionOutcome: () => ({ classification: 'R' }),
  },
  cooperative: {
    name: 'cooperative',
    intent: 'files what happened and leans towards whatever the Directorate asked for last',
    chooseResolution: (card) => card.resolutions[card.resolutions.length - 1]!.id,
    incidentClaim: () => 'P',
    inspectionsPerShift: () => 3,
    inspectionOutcome: () => ({ classification: 'P' }),
  },
  ruthless: {
    name: 'ruthless',
    intent: 'detains and files hard, which the audit rewards until the district answers',
    chooseResolution: (card) => card.resolutions[card.resolutions.length - 1]!.id,
    incidentClaim: () => 'D',
    inspectionsPerShift: () => 4,
    inspectionOutcome: () => ({ classification: 'D' }),
  },
  absent: {
    name: 'absent',
    intent: 'leaves incidents unfiled and takes the first option, to measure what the desk does alone',
    chooseResolution: () => 'X',
    incidentClaim: () => null,
    inspectionsPerShift: () => 0,
    inspectionOutcome: () => ({ classification: 'R' }),
  },
};

export interface ShiftRecord {
  shift: number;
  temperature: number;
  grief: number;
  claims: Record<string, number>;
  findings: number;
  review: boolean;
  reviewsInARow: number;
  autoFiled: number;
  scenes: number;
  known: number;
  available: number;
  dueEpilogues: string[];
}

export interface CampaignResult {
  seed: number;
  policy: PolicyName;
  shifts: ShiftRecord[];
  ending: string;
  /** what a reader needs to see to trust the run */
  notes: string[];
}

export interface CampaignOptions {
  seed: number;
  policy: Policy;
  shifts: number;
  map: ConstructorParameters<typeof Simulation>[0]['map'];
  mapJson: ConstructorParameters<typeof Simulation>[0]['mapJson'];
  citizens: ConstructorParameters<typeof Simulation>[0]['citizens'];
  sector: SectorState;
  cards: readonly Storylet[];
  directives: readonly Directive[];
  /** the desk observation the fault vector learns from; the real game passes the Director */
  observe?: (vector: FaultVector, audit: AuditResult) => FaultVector;
}

/**
 * Play a whole campaign, one shift at a time, and report what happened.
 *
 * Incidents are not simulated at the tactical level — a raid takes minutes of real play
 * and this runs fifteen shifts in under a second. The runner therefore uses the incident
 * *docket* path with the policy's claim, which is the part the audit and the district
 * actually see. That is a real limitation and it is stated in the report rather than
 * hidden.
 */
export function runCampaign(opts: CampaignOptions): CampaignResult {
  const sim = new Simulation({
    seed: opts.seed,
    shift: 1,
    map: opts.map,
    mapJson: opts.mapJson,
    citizens: opts.citizens,
    sector: opts.sector,
  });
  let sector = opts.sector;
  let scenes: SceneLogState = createSceneLog(1);
  let fault: FaultVector = {};
  let reviewsInARow = 0;
  let ending = 'in service';
  const shifts: ShiftRecord[] = [];
  const notes: string[] = [];

  for (let n = 1; n <= opts.shifts; n++) {
    sim.beginBeat();

    /* ---------------------------------------------------------------- scenes */
    scenes = createSceneLog(n);
    const deck = buildDeck('beat_morning', opts.cards, { includeBeats: true });
    const drawn = deck.draw({
      k: n === 1 ? 2 : 1,
      ctx: {
        shift: n,
        temperature: temperature(sector),
        flags: sim.effectState.flags,
        knownCount: sim.knownHouseholdIds().length,
        pacing: sim.arbiterState(),
        faultVector: fault,
      },
      rng: streamFor(opts.seed, n, 'campaign-deck'),
    });
    scenes.drawn = drawn.picks.filter((c) => c._type !== 'epilogue_storylet');
    for (const card of pending(scenes)) {
      const resolutionId = opts.policy.chooseResolution(card);
      playResolution(scenes, { card, resolutionId });
    }
    const totals = sceneTotals(scenes);

    /* ------------------------------------------------------------ inspections */
    // Without this the runner never names anybody, `known` stays 0 for fifteen shifts,
    // and recurrence has nothing to draw on — the campaign would be measuring a game
    // where nobody is ever inspected, which is not the game.
    const roster = opts.citizens.citizens.map((c) => c.id);
    const count = Math.min(opts.policy.inspectionsPerShift(), roster.length);
    for (let i = 0; i < count; i++) {
      const id = roster[(n * 3 + i) % roster.length]!;
      // asked and closed in one pass: the runner writes no transcript, because the
      // conversation's content is a playtest question, not a tuning one
      if (!sim.openInspection(id)) continue;
      const outcome = opts.policy.inspectionOutcome();
      const event = sim.resolveInspection(outcome.classification, { bribe: outcome.bribe });
      sim.closeInspection();
      if (event) {
        // whether the Warden writes it up is the policy's business, and the difference
        // between writing it up and leaving it is the whole point of the game
        const claim = opts.policy.incidentClaim();
        if (claim !== null) sim.file(event.ref, { claim: { ...event.draft, classification: outcome.classification }, tags: [], free_text: '' });
      }
    }

    /* ------------------------------------------------------------- incidents */
    // the recurrence deck names a household; the raid happens there (P3-T02 §2f)
    const known = sim.knownHouseholdIds().map((household_id) => ({ household_id, reason: 'filed' }));
    const recurrence = chooseRecurrence({
      sector,
      known,
      grudges: sim.grudges,
      shift: n,
      seed: opts.seed,
    });
    const claim = opts.policy.incidentClaim();
    if (recurrence) {
      sim.addIncident(quietRaid(), {
        ref: `int-${n}-1`,
        address: 'Block C',
        cameras: [],
        householdId: recurrence.household_id,
      });
      const event = sim.docket.find((e) => e.ref === `int-${n}-1`);
      if (event) {
        // the policy stamps the form and *files* it, exactly as the desk does. An earlier
        // version of this runner only stamped the draft and never filed, so every claim
        // the policies made was thrown away and all four ran identically — the audit saw
        // nothing but auto-filings, which is a failure mode of the tool, not the game.
        const stamped = claim ?? event.draft.classification;
        event.draft = { ...event.draft, classification: stamped };
        if (claim) sim.file(event.ref, { claim: event.draft, tags: [], free_text: '' });
      }
    }

    /* ----------------------------------------------------------------- audit */
    // captured before submit() writes the lines the Warden did not; applied after
    // captured before submit() writes the lines the Warden did not; recomputed after, so
    // the auto-filed ones are included. The act collection itself is shared (shift-cycle).
    const preAudit = collectReaction(sim, sector, totals.legitimacy);
    const audit = sim.submit();
    const reaction = preAudit ? collectReaction(sim, sector, totals.legitimacy) : null;
    if (reaction) {
      sector = applyReaction(sector, reaction);
      sim.setSector(sector);
    }
    fault = opts.observe ? opts.observe(fault, audit) : fault;
    reviewsInARow = audit.review ? reviewsInARow + 1 : 0;

    const claims: Record<string, number> = {};
    for (const line of sim.record.query({ shift: n })) {
      claims[line.claim.classification] = (claims[line.claim.classification] ?? 0) + 1;
    }
    shifts.push({
      shift: n,
      temperature: temperature(sector),
      grief: Math.round(sector.households.filter((h) => h.grievance > 0.5).length),
      claims,
      findings: audit.findings.length,
      review: audit.review,
      reviewsInARow,
      autoFiled: sim.lastAutoFiled.length,
      scenes: scenes.played.length,
      known: sim.knownHouseholdIds().length,
      available: sector.households.filter((h) => h.flags.includes('available')).length,
      dueEpilogues: dueEpilogues(sim, opts.cards, n).map((e) => e.id),
    });

    if (reviewsInARow >= 3) {
      ending = 'removed from post';
      notes.push(`three consecutive reviews by shift ${n}: the run ends here, as P4-T06 requires`);
      break;
    }
    if (n < opts.shifts) {
      const cycle = advanceShift(sim, { directives: opts.directives, epilogues: opts.cards });
      sector = { ...sector, shift: cycle.sector.shifts };
      sim.resetBeat();
    }
  }

  if (ending === 'in service') {
    const last = shifts.at(-1);
    if (last && last.temperature > 70) ending = 'the sector is lost';
    else if (last && last.available >= 6) ending = 'the Cell owns the block';
  }
  notes.push(
    'incidents are resolved through the docket path, not the tactical scene — the runner ' +
      'measures the paperwork loop and the district, not the raid',
  );
  return { seed: opts.seed, policy: opts.policy.name, shifts, ending, notes };
}

/* ------------------------------------------------------------------ helpers */

/** The smallest IncidentResult the docket path accepts: nobody was home. */
function quietRaid() {
  return {
    roomClaims: [{ room: 'north', claimedClear: true, actuallyClear: true }],
    forceUsed: [],
    damage: 0,
    detainees: 0,
    casualties: 0,
    noiseEvents: 1,
    loudestNoise: 1,
    heardByNeighbours: 0,
    wallsBreached: 0,
    entryMethod: 'knock_talk' as const,
    unauthorisedForce: false,
    stabilised: [],
    unfound: [],
    soloHits: 0,
    ticksElapsed: 40,
  };
}

function collectReaction(sim: Simulation, sector: SectorState, legitimacy: number) {
  const acts = collectActs(sim.docket, sim.record.query({ shift: sim.state.shift }), sim.lastAutoFiled);
  if (acts.length === 0) return null;
  // a shift of decent decisions is felt the same way good paperwork is (P3-T04)
  const base: SectorState =
    legitimacy > 0
      ? {
          ...sector,
          shift: sim.state.shift,
          households: sector.households.map((h) => ({
            ...h,
            grievance: Math.max(0, h.grievance - legitimacy * 0.02),
          })),
        }
      : { ...sector, shift: sim.state.shift };
  return reactToFilings({ sector: base, acts });
}

function applyReaction(sector: SectorState, reaction: ReturnType<typeof reactToFilings>): SectorState {
  return { ...reaction.sector, households: reaction.sector.households.map((h) => harden(h).household) };
}

function dueEpilogues(sim: Simulation, cards: readonly Storylet[], shift: number): Storylet[] {
  return cards.filter(
    (e) => e._type === 'epilogue_storylet' && sim.effectState.scheduled.some((s) => s.id === e.id && s.dueShift <= shift),
  );
}

/** A campaign as one readable line, for a tuning log. */
export function summariseCampaign(result: CampaignResult): string {
  const temps = result.shifts.map((s) => s.temperature);
  const avg = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : 0;
  return (
    `${result.policy} seed ${result.seed}: ${result.shifts.length} shifts, ` +
    `temp ${temps[0]}→${temps.at(-1)} (avg ${avg}), ` +
    `${result.shifts.reduce((a, s) => a + s.findings, 0)} findings, ` +
    `${result.shifts.reduce((a, s) => a + s.autoFiled, 0)} auto-filed · ${result.ending}`
  );
}
