/**
 * The three directors (SYS-DIR-01 §5, P3-T06..T09) plus the pacing FSM that
 * feeds them.
 *
 * There are three, not one, because a single invisible intelligence hunting the
 * player centres the player in a world that is supposed to feel indifferent. So:
 *
 *  - **Desk** decides what *administrative* pressure arrives (directives, quotas,
 *    audits). It probes the Warden's habits — the fault-line scorer.
 *  - **Arbiter** decides *pacing* only. It is the four-state FSM from §6.2 and it
 *    owns budgets, not content: `arbitrate()` says which decks may fire, and
 *    nothing more.
 *  - **Oversight (the Eye)** is a *gauge*, not a planner. Attention rises from
 *    detection and decays with restraint; the ladder is a lookup, not a search.
 *
 * The Cell's HTN-lite plans are a fourth thing but they are content-shaped, so they
 * live in `src/systems/plans.ts` and speak to the Arbiter like anyone else.
 *
 * Every function here is deterministic and reads only the *claim* side of the
 * state — never `truth` (boundary rule 5). A director that peeks is a director that
 * cheats, and the audit tests exist to catch exactly that.
 */

import type { Rng } from '@core/rng';

/* ------------------------------------------------------- fault lines (Desk) */

/**
 * The eight things the Desk scores the Warden on. These are *behavioural* tags,
 * not moral ones: the Desk does not care whether you are cruel, only whether it
 * can predict you.
 */
export const FAULT_LINES = [
  'brutality',
  'paperwork_neglect',
  'over_authorisation',
  'favouritism',
  'curfew_tolerance',
  'shortcutting',
  'over_reporting',
  'delegation',
] as const;
export type FaultLine = (typeof FAULT_LINES)[number];

export type FaultVector = Record<string, number>;

/** Observations the Desk can make without reading truth. */
export interface DeskObservation {
  /** force weight of the incident, 0–9 */
  force_weight?: number;
  rungs_used?: readonly number[];
  authorisations_filed?: number;
  records_filed?: number;
  records_backdated?: number;
  households_highlighted?: readonly string[];
  arrests?: number;
  releases?: number;
  curfew_enforced?: boolean;
  squads_used?: number;
  /** records where the claim and the audit disagreed */
  contradictions?: number;
}

const DECAY = 0.85;
const LIFT = 0.35;

/**
 * Update the Desk's picture of the Warden. Moves slowly on purpose: a player who
 * does one brutal thing in fifteen shifts should not be handed brutal content, and
 * `DECAY` is what buys that hysteresis.
 */
export function observe(prior: FaultVector, obs: DeskObservation): FaultVector {
  const next: FaultVector = {};
  for (const line of FAULT_LINES) next[line] = (prior[line] ?? 0) * DECAY;

  const bump = (line: FaultLine, amount: number) => {
    next[line] = Math.min(1, (next[line] ?? 0) + amount);
  };

  if (obs.force_weight !== undefined) bump('brutality', (obs.force_weight / 9) * LIFT * 2);
  for (const rung of obs.rungs_used ?? []) {
    if (rung >= 4) bump('brutality', 0.12);
    if (rung === 5) bump('brutality', 0.2);
  }
  if ((obs.authorisations_filed ?? 0) > 0 && (obs.records_filed ?? 0) === 0) {
    bump('over_authorisation', 0.3);
  }
  if ((obs.records_backdated ?? 0) > 0) bump('shortcutting', 0.25);
  if ((obs.records_filed ?? 0) === 0 && (obs.arrests ?? 0) > 0) bump('paperwork_neglect', 0.3);
  if ((obs.releases ?? 0) > (obs.arrests ?? 0)) bump('favouritism', 0.2);
  if (obs.curfew_enforced === false) bump('curfew_tolerance', 0.2);
  if ((obs.squads_used ?? 0) > 1) bump('delegation', 0.15);
  if ((obs.contradictions ?? 0) > 0) bump('over_reporting', 0.35);

  return next;
}

/** The single habit the Desk leans on hardest, for the "why this?" line. */
export function dominantFault(vector: FaultVector): FaultLine | null {
  let best: FaultLine | null = null;
  let bestValue = 0.12;
  for (const line of FAULT_LINES) {
    const v = vector[line] ?? 0;
    if (v > bestValue) {
      best = line;
      bestValue = v;
    }
  }
  return best;
}

/** How a directive's tag reads to a player: the Desk's own words, not ours. */
export const FAULT_PHRASE: Record<FaultLine, string> = {
  brutality: 'you have been ending things instead of handling them',
  paperwork_neglect: 'your files have stopped matching your nights',
  over_authorisation: 'you sign for more than you report',
  favouritism: 'the same addresses keep coming up clean',
  curfew_tolerance: 'the streets are busier than the passes allow',
  shortcutting: 'your lines were not written the night they claim',
  over_reporting: 'your reports contradict themselves',
  delegation: 'you have not been in a room in some time',
};

/* ------------------------------------------------------ the Arbiter FSM */

export const PACING_STATES = ['calm', 'build', 'peak', 'release'] as const;
export type PacingState = (typeof PACING_STATES)[number];

export interface ArbiterInput {
  shift: number;
  temperature: number;
  storyletsConsumed: number;
  incidentsDispatched: number;
  quietScenesPlayed: number;
  /** force weight committed this shift; >=6 means lethal or collective */
  forceCommitted: number;
  deaths: number;
  factionPlanCompleted: boolean;
  incidentResolved: boolean;
}

export interface ArbiterState {
  state: PacingState;
  /** the shift the state was entered on, so RELEASE can expire */
  enteredShift: number;
  /** how many armed incidents are still allowed this shift */
  armedBudget: number;
  /** how many new incidents may be dispatched at all */
  incidentBudget: number;
  /** why we are in this state, in one clause */
  why: string;
}

export function newArbiter(shift = 0): ArbiterState {
  return { state: 'calm', enteredShift: shift, armedBudget: 0, incidentBudget: 0, why: 'shift start' };
}

const BUDGETS: Record<PacingState, { armed: number; incidents: number }> = {
  calm: { armed: 0, incidents: 0 },
  build: { armed: 1, incidents: 1 },
  peak: { armed: 0, incidents: 0 },
  release: { armed: 0, incidents: 0 },
};

/**
 * The Arbiter's whole job. ~40 lines of transition and a budget lookup, because
 * the lesson from *Left 4 Dead* is: pace with a small machine, fill with a big deck.
 *
 * Note the asymmetry — PEAK and RELEASE both forbid new content, but for opposite
 * reasons (one is a scene, the other is a silence). Encoding that as one state
 * would make the barks wrong.
 */
export function arbitrate(state: ArbiterState, input: ArbiterInput): ArbiterState {
  const lethal = input.forceCommitted >= 6 || input.deaths > 0;

  const next: PacingState = (() => {
    // RELEASE outranks everything: a shift that opened on a death does not get to
    // be "calm" because nobody had consumed three storylets yet.
    if (state.state === 'release') return input.shift > state.enteredShift ? 'calm' : 'release';
    if (lethal) return 'release';

    switch (state.state) {
      case 'calm':
        if (input.temperature > 60) return 'build';
        if (input.storyletsConsumed >= 3) return 'build';
        return 'calm';
      case 'build':
        if (input.incidentsDispatched > 0) return 'peak';
        return 'build';
      case 'peak':
        if (input.incidentResolved) return 'calm';
        return 'peak';
    }
  })();

  const why: string =
    next === state.state
      ? state.why
      : next === 'build'
        ? input.temperature > 60
          ? `temperature ${Math.round(input.temperature)} passed 60`
          : `${input.storyletsConsumed} storylets consumed`
        : next === 'peak'
          ? 'an incident was dispatched — the scene is the scene'
          : next === 'release'
            ? input.deaths > 0
              ? 'someone died'
              : 'lethal or collective force was committed'
            : 'the shift turned over';

  const budget = BUDGETS[next];
  return {
    state: next,
    enteredShift: next === state.state ? state.enteredShift : input.shift,
    armedBudget: budget.armed,
    incidentBudget: budget.incidents,
    why,
  };
}

export function permitsArmedIncident(state: ArbiterState, alreadyDispatched: number): boolean {
  return alreadyDispatched < state.armedBudget;
}

/** RELEASE means no threats at all — this is the guard the deck must honour. */
export function permitsThreat(state: ArbiterState): boolean {
  return state.state !== 'release';
}

/* ------------------------------------------------------------- the Eye */

export const EYE_LEVELS = [0, 1, 2, 3, 4] as const;
export type EyeLevel = (typeof EYE_LEVELS)[number];

export interface EyeState {
  /** 0–1 */
  attention: number;
  level: EyeLevel;
  /** detections in the trailing 3-shift window */
  recent: number[];
  lastWhy: string;
}

export const EYE_LADDER: Array<{ level: EyeLevel; min: number; label: string; effect: string }> = [
  { level: 0, min: 0, label: 'unremarked', effect: 'nothing watches' },
  { level: 1, min: 1, label: 'noticed', effect: 'cameras turn a little slower toward you' },
  { level: 2, min: 2, label: 'watched', effect: 'a patrol is routed past your post' },
  { level: 3, min: 4, label: 'flagged', effect: 'Oversight reads your reports before your superior does' },
  { level: 4, min: 5, label: 'pulled', effect: 'your next shift opens with a review' },
];

export function newEye(): EyeState {
  return { attention: 0, level: 0, recent: [], lastWhy: 'no detections' };
}

/**
 * Record a detection. Attention is a *gauge*: it rises, it decays, and it is
 * deliberately readable. The ladder (0 / 1–2 / 3–4 / 5+) is a lookup over a 3-shift
 * window, not a planner — the Eye never decides to come for you, it only notices.
 */
export function notice(eye: EyeState, shift: number, opts: { severity?: number; why: string }): EyeState {
  const severity = opts.severity ?? 1;
  const recent = [...eye.recent, shift].filter((s) => s > shift - 3);
  const attention = Math.min(1, eye.attention + 0.18 * severity);
  const rung = EYE_LADDER.reduce((acc, r) => (recent.length >= r.min ? r : acc), EYE_LADDER[0]!);
  return { attention, level: rung.level, recent, lastWhy: opts.why };
}

/** Every shift the gauge cools. Restraint is the only thing that buys it back. */
export function eyeTick(eye: EyeState, shift: number): EyeState {
  const recent = eye.recent.filter((s) => s > shift - 3);
  const attention = eye.attention * 0.88;
  const rung = EYE_LADDER.reduce((acc, r) => (recent.length >= r.min ? r : acc), EYE_LADDER[0]!);
  return {
    ...eye,
    attention,
    recent,
    level: rung.level,
    lastWhy: recent.length === 0 ? 'nothing has been noticed for three shifts' : eye.lastWhy,
  };
}

/* ---------------------------------------------------------- the Desk tick */

export interface DeskPick {
  directiveId: string;
  reason: string;
}

/**
 * Choose the shift's directives by probing the fault vector. Kept dumb on
 * purpose: the Desk selects from an authored list and explains itself. If the
 * player cannot see why a directive arrived, the Desk has failed (this is the
 * "the game just decided to punish me" failure, RISK R17).
 */
export function chooseDirectives(
  candidates: ReadonlyArray<{ id: string; fault_lines?: readonly string[]; pressure?: number }>,
  vector: FaultVector,
  opts: { count: number; temperature: number; rng: Rng },
): DeskPick[] {
  if (candidates.length === 0) return [];
  const scored = candidates.map((c) => {
    const tags = c.fault_lines ?? [];
    let best = 0;
    for (const tag of tags) best = Math.max(best, vector[tag] ?? 0);
    const alignment = tags.length === 0 ? 0.5 : 0.5 + best * 0.5;
    // heat raises pressure cards: a hostile district does not get paperwork about bins
    const heat = 0.75 + (c.pressure ?? 0.5) * (opts.temperature / 100) * 0.5;
    return { card: c, score: alignment * heat, alignment };
  });

  scored.sort((a, b) => b.score - a.score);
  const picks: DeskPick[] = [];
  const pool = [...scored];
  while (picks.length < opts.count && pool.length > 0) {
    const total = pool.reduce((a, s) => a + s.score, 0);
    let roll = opts.rng.next() * total;
    let index = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]!.score;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    const chosen = pool.splice(index, 1)[0]!;
    const line = (chosen.card.fault_lines ?? []).find((t) => (vector[t] ?? 0) > 0.12) as FaultLine | undefined;
    picks.push({
      directiveId: chosen.card.id,
      reason: line ? FAULT_PHRASE[line] : 'routine allocation for the district',
    });
  }
  return picks;
}
