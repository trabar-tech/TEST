/**
 * The showrunner: one shift, wired together (P3-T03, P3-T10, P3-T12).
 *
 * Every system in this phase is a pure function of state — households generate
 * deterministically, decks score deterministically, the Arbiter is an FSM, the Eye
 * is a gauge, plans are three authored steps. That is only worth anything if
 * something *composes* them into a shift, and this file is that composition:
 *
 *   sector tick → factions conspire → directors choose content →
 *   Arbiter polices it → the deck draws → the Inspector shows the arithmetic
 *
 * ## Why the Inspector is not a debug screen
 *
 * The phase doc requires an AI score inspector (P3-T10), and it is easy to build it
 * as a dev overlay. That would miss the point. The G2 failure question is "why did
 * something bad happen to me?" — and a player who cannot answer it calls the game
 * unfair (RISK R17). So the Inspector is written for the player: `inspectShift()`
 * returns the same arithmetic the director used, in the same order, with the same
 * numbers, and `ShiftInspector` renders it in plain sentences.
 *
 * Nothing here reads `truth`. If the Inspector ever needs a fact, the fact goes
 * into a claim first.
 */

import type { Rng } from '@core/rng';
import type { Storylet } from '@core/content';
import {
  KnownSet,
  generateSector,
  grade,
  legitimacy,
  materialise,
  temperature,
  type Household,
  type MaterialisedAgent,
  type SectorState,
} from '@systems/households';
import {
  arbitrate,
  chooseDirectives,
  dominantFault,
  eyeTick,
  FAULT_PHRASE,
  newArbiter,
  newEye,
  notice,
  observe,
  permitsThreat,
  type ArbiterState,
  type DeskPick,
  type EyeState,
  type FaultVector,
} from '@systems/directors';
import { advancePlan, decayGrudges, readPlan, startPlan, type Grudge, type PlanDef, type PlanInstance } from '@systems/plans';
import { buildDeck, applyResolution, dueEpilogues, type ScoreBreakdown } from '@systems/storylets';

export interface ShowrunnerOptions {
  seed: number;
  households?: number;
  /** what an informant network is worth, 0–1 */
  informantCoverage?: number;
}

export interface ShiftOutput {
  shift: number;
  temperature: number;
  legitimacy: number;
  grade: string;
  arbiter: ArbiterState;
  eye: EyeState;
  directives: DeskPick[];
  /** the cards the deck picked, in order */
  storylets: Storylet[];
  /** the Inspector's arithmetic, one entry per card in the deck */
  trace: ScoreBreakdown[];
  /** what the factions did, in sentences a report could carry */
  factionReport: string[];
  /** what the informants say, if anyone is listening */
  intel: string[];
  /** epilogue cards that came due this shift */
  epilogues: string[];
  fault: FaultVector;
  dominantFault: string | null;
}

export interface ShowrunnerState {
  sector: SectorState;
  known: KnownSet;
  eye: EyeState;
  /** pacing persists across shifts: RELEASE has to survive into the next morning */
  arbiter: ArbiterState;
  fault: FaultVector;
  plans: PlanInstance[];
  grudges: Grudge[];
  effects: { flags: Record<string, boolean | number | string>; scheduled: Array<{ id: string; dueShift: number; cause: string }> };
  shift: number;
  seed: number;
  /** archetypes played in the last three shifts, newest last */
  recentArchetypes: string[];
  informantCoverage: number;
  /** safehouses the player has denied the factions */
  burnedSites: string[];
}

export const CELL_PLAN: PlanDef = {
  id: 'arm_cell_2',
  faction: 'cell',
  produces: 'checkpoint_bombing',
  recruitNeeds: { grievanceAtLeast: 0.6 },
  needsSite: 'safehouse',
};

export function createShowrunner(opts: ShowrunnerOptions): ShowrunnerState {
  return {
    sector: generateSector({ seed: opts.seed, count: opts.households }),
    known: new KnownSet(),
    eye: newEye(),
    arbiter: newArbiter(0),
    fault: {},
    plans: [startPlan(CELL_PLAN, { households: [] }, 0)],
    grudges: [],
    effects: { flags: {}, scheduled: [] },
    shift: 0,
    seed: opts.seed,
    recentArchetypes: [],
    informantCoverage: opts.informantCoverage ?? 0.2,
    burnedSites: [],
  };
}

export interface ShiftInput {
  /** storylets already consumed this shift by the tactical layer */
  consumed?: number;
  incidentsDispatched?: number;
  incidentResolved?: boolean;
  forceCommitted?: number;
  deaths?: number;
  arrests?: number;
  recordsFiled?: number;
  recordsBackdated?: number;
  authorisationsFiled?: number;
  rungsUsed?: number[];
  curfewEnforced?: boolean;
  contradictions?: number;
  /** sites the player has denied the factions this shift */
  burnedSites?: string[];
  rng: Rng;
}

/**
 * Run one shift. Returns everything the player is allowed to see, including the
 * reasoning — because in this game the reasoning *is* the difficulty curve.
 */
export function runShift(state: ShowrunnerState, cards: readonly Storylet[], input: ShiftInput): ShiftOutput {
  const shift = state.shift;

  /* 1 — the Desk watches, then the sector reacts to what it saw */
  const fault = observe(state.fault, {
    force_weight: input.forceCommitted,
    rungs_used: input.rungsUsed,
    authorisations_filed: input.authorisationsFiled,
    records_filed: input.recordsFiled,
    records_backdated: input.recordsBackdated,
    arrests: input.arrests,
    curfew_enforced: input.curfewEnforced,
    contradictions: input.contradictions,
  });
  state.fault = fault;

  state.sector = {
    ...state.sector,
    shift,
    force_index: Math.min(20, state.sector.force_index + (input.forceCommitted ?? 0) * 0.5),
    faction_heat: Math.min(1, state.sector.faction_heat + (input.forceCommitted ?? 0) * 0.01),
  };

  /* 2 — factions conspire. Their success mutates the sector; that is the whole point */
  const factionReport: string[] = [];
  const intel: string[] = [];
  const world = {
    households: state.sector.households,
    safehouses: ['printery_b', 'flat_14'],
    // burned sites persist: a safehouse the player found is not un-found next shift
    deniedSites: [...state.burnedSites, ...(input.burnedSites ?? [])],
    arrestsThisShift: input.arrests ?? 0,
    curfewEnforced: input.curfewEnforced,
  };

  let producedIncident: string | undefined;
  state.plans = state.plans.map((plan) => {
    const tick = advancePlan(plan, world, shift, input.rng);
    factionReport.push(...tick.report);
    if (tick.grudge) state.grudges.push(tick.grudge);
    if (tick.produces) producedIncident = tick.produces;
    const read = readPlan(tick.instance, state.informantCoverage);
    if (read) intel.push(`Informant: ${read}`);
    if (tick.instance.status === 'completed') {
      // a completed plan re-arms: the insurgency does not run out of ideas, it
      // runs out of patience
      return startPlan(CELL_PLAN, world, shift);
    }
    return tick.instance;
  });

  /* 3 — the Arbiter polices what content may exist at all */
  const arbiter = arbitrate(state.arbiter, {
    shift,
    temperature: temperature(state.sector),
    storyletsConsumed: input.consumed ?? 0,
    incidentsDispatched: input.incidentsDispatched ?? (producedIncident ? 1 : 0),
    quietScenesPlayed: 0,
    forceCommitted: input.forceCommitted ?? 0,
    deaths: input.deaths ?? 0,
    factionPlanCompleted: producedIncident !== undefined,
    incidentResolved: input.incidentResolved ?? false,
  });

  state.arbiter = arbiter;

  /* 4 — the deck. A RELEASE shift draws nothing sharp: that is the guard */
  const ctx = {
    shift,
    temperature: temperature(state.sector),
    flags: state.effects.flags,
    knownCount: state.known.size,
    pacing: arbiter.state,
    faultVector: fault,
    recentArchetypes: state.recentArchetypes,
  };
  const filtered = permitsThreat(arbiter)
    ? cards
    : cards.filter((c) => c.pressure < 0.5);
  const played = new Set<string>();
  const draw = buildDeck('beat_morning', filtered, { includeBeats: true }).draw({
    k: arbiter.state === 'calm' ? 3 : 2,
    ctx,
    rng: input.rng,
    played,
  });

  /* 5 — the Desk's directives, which must explain themselves */
  const directiveCards = cards
    .filter((c) => c.deck === 'desk')
    .map((c) => ({ id: c.id, fault_lines: c.fault_lines, pressure: c.pressure }));
  const directives = chooseDirectives(directiveCards, fault, {
    count: 1,
    temperature: ctx.temperature,
    rng: input.rng,
  });

  /* 6 — epilogues: the cost of a decision, arriving late */
  const due = dueEpilogues(state.effects, shift);
  for (const epilogue of due) {
    applyResolution(state.effects, {}, { shift, cause: epilogue.cause });
  }
  state.effects.scheduled = state.effects.scheduled.filter((s) => s.dueShift > shift);

  /* 7 — memory of what has been played, so novelty decays honestly */
  state.recentArchetypes = [...state.recentArchetypes, ...draw.picks.map((p) => p.deck)].slice(-6);

  state.shift = shift + 1;
  state.eye = eyeTick(state.eye, shift);
  state.grudges = decayGrudges(state.grudges, shift);

  state.burnedSites = [...new Set([...state.burnedSites, ...(input.burnedSites ?? [])])];

  return {
    shift,
    temperature: temperature(state.sector),
    legitimacy: legitimacy(state.sector),
    grade: grade(state.sector),
    arbiter,
    eye: state.eye,
    directives,
    storylets: draw.picks,
    trace: draw.trace,
    factionReport,
    intel,
    epilogues: due.map((d) => d.id),
    fault,
    dominantFault: dominantFault(fault),
  };
}

/* --------------------------------------------------------- the Inspector */

export interface InspectorRow {
  label: string;
  value: string;
  /** plain-language gloss, shown smaller; empty when the row speaks for itself */
  note: string;
}

/**
 * The player-facing arithmetic of a shift: the same numbers the director used, in
 * the same order, with no hidden sixth factor. If this cannot explain a shift, the
 * shift is unfair and the design is wrong — that is the point of building it.
 */
export function inspectShift(out: ShiftOutput): InspectorRow[] {
  const rows: InspectorRow[] = [
    {
      label: 'District temperature',
      value: `${out.temperature}`,
      note: `${out.grade} — one number, read like weather, not a meter`,
    },
    {
      label: 'Legitimacy',
      value: `${Math.round(out.legitimacy)}`,
      note: 'mean household loyalty, less what the grievances cost it',
    },
    {
      label: 'Pacing',
      value: out.arbiter.state,
      note: out.arbiter.why,
    },
    {
      label: 'Oversight attention',
      value: `${Math.round(out.eye.attention * 100)}%`,
      note: out.eye.lastWhy,
    },
  ];

  if (out.dominantFault) {
    rows.push({
      label: 'What the Desk thinks of you',
      value: out.dominantFault.replace(/_/g, ' '),
      note: FAULT_PHRASE[out.dominantFault as keyof typeof FAULT_PHRASE] ?? '',
    });
  }

  for (const pick of out.directives) {
    rows.push({ label: 'Directive', value: pick.directiveId, note: pick.reason });
  }

  for (const entry of out.trace.filter((t) => t.eligible).sort((a, b) => b.final - a.final).slice(0, 4)) {
    rows.push({
      label: `Card ${entry.card.id}`,
      value: entry.final.toFixed(3),
      note: `novelty ${entry.novelty} × alignment ${entry.alignment.toFixed(2)} × pacing ${entry.pacing.toFixed(2)} × temperature ${entry.temperature.toFixed(2)}`,
    });
  }

  for (const line of out.factionReport) rows.push({ label: 'District', value: '', note: line });
  for (const line of out.intel) rows.push({ label: 'Intelligence', value: '', note: line });

  return rows;
}

/** Markdown version, for the G2 protocol's pasteable report. */
export function inspectionMarkdown(out: ShiftOutput): string {
  const lines = [`### Shift ${out.shift} — why this happened`, ''];
  for (const row of inspectShift(out)) {
    lines.push(row.value ? `- **${row.label}** ${row.value} — ${row.note}` : `- ${row.note}`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------ domain helpers */

/** Convenience for UI code: a citizen, or a reason there isn't one. */
export function citizenAt(state: ShowrunnerState, householdId: string): MaterialisedAgent | null {
  if (!state.sector.households.some((h) => h.id === householdId)) return null;
  return materialise(state.sector, householdId, state.seed);
}

/** Meet someone: the only way into the Known set, and it costs a slot. */
export function meet(state: ShowrunnerState, householdId: string, reason: string): { agent: MaterialisedAgent; evicted: string | null } | null {
  const agent = citizenAt(state, householdId);
  if (!agent) return null;
  const eviction = state.known.add({ household_id: householdId, reason }, state.shift);
  return { agent, evicted: eviction?.household_id ?? null };
}

/** Which households are visible on the sector map, and how hot each one is. */
export function householdHeat(state: ShowrunnerState): Array<{ household: Household; heat: number; known: boolean }> {
  return state.sector.households.map((household) => ({
    household,
    heat: Math.round((household.grievance * 0.6 + (1 - household.loyalty) * 0.4) * 100),
    known: state.known.has(household.id),
  }));
}

/** Record a detection, from anything with a claim attached. */
export function reportDetection(state: ShowrunnerState, why: string, severity = 1): void {
  state.eye = notice(state.eye, state.shift, { why, severity });
}
