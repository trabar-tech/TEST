/**
 * Who comes back (P3-T02 acceptance: "the person you arrested on Monday appears…
 * on Tuesday").
 *
 * The 12-Known cap only means something if the twelve *return*. Without recurrence a
 * Warden can learn twelve names and never meet any of them again, and the apophenia
 * budget — the whole reason the cap exists — spends itself on nothing.
 *
 * This module answers one question per shift: **which household is in the news?** It
 * is deliberately not "spawn an incident at their door". It produces a *line* — a
 * reason the player can read, and a place they can go. The design rule that governs
 * every other director applies here too: a consequence names its cause.
 *
 * Weighting, in plain terms:
 *
 *  - a Known household outranks an unknown one, because the player can name them;
 *  - an `available` household outranks a quiet one, because grievance is a plot;
 *  - a household with a live grudge outranks both, because they have a reason;
 *  - anything the district cannot see is not in the news.
 *
 * Deterministic, like everything else: same seed, shift and state → same household.
 */

import { streamFor } from '@core/rng';
import type { Household, SectorState } from './households';
import type { KnownEntry } from './households';
import type { Grudge } from './plans';

export interface RecurrenceCandidate {
  household: Household;
  why: string;
  weight: number;
}

export interface Recurrence {
  household_id: string;
  /** the household's own name for what happened, in one line */
  line: string;
  /** why this one and not another, in the Warden's terms */
  why: string;
  /** true when the player could put a name to them before this shift */
  known: boolean;
}

export interface RecurrenceOptions {
  sector: SectorState;
  known: ReadonlyArray<Pick<KnownEntry, 'household_id' | 'reason'> & Partial<KnownEntry>>;
  grudges?: readonly Grudge[];
  shift: number;
  seed: number;
  /**
   * Ladder step 3 (G2 failure): force a Known face every shift. Default true — a
   * Warden who knows nobody yet simply gets an unknown household, which is the
   * honest answer.
   */
  preferKnown?: boolean;
}

const BASE_WEIGHT = 1;
const KNOWN_WEIGHT = 3.2;
const AVAILABLE_WEIGHT = 1.8;
const GRUDGE_WEIGHT = 2.4;
/** a household that came up last shift is unlikely to come up twice running */
const RECENT_PENALTY = 0.25;

/**
 * Score every household for "is this the one that comes back tonight?".
 *
 * Exposed separately from the draw because the answer to "why her?" has to be
 * inspectable — the same reason `trace()` exists for the deck.
 */
export function rankRecurrence(opts: RecurrenceOptions): RecurrenceCandidate[] {
  const knownIds = new Set(opts.known.map((k) => k.household_id));
  const grudgeByHousehold = new Map<string, Grudge>();
  for (const grudge of opts.grudges ?? []) grudgeByHousehold.set(grudge.citizenId, grudge);

  return opts.sector.households.map((household) => {
    let weight = BASE_WEIGHT;
    const why: string[] = [];

    if (knownIds.has(household.id)) {
      weight *= KNOWN_WEIGHT;
      why.push('you could put a name to them');
    }
    if (household.flags.includes('available')) {
      weight *= AVAILABLE_WEIGHT;
      why.push('the Cell has been to their door');
    }
    const grudge = grudgeByHousehold.get(household.id);
    if (grudge) {
      weight *= GRUDGE_WEIGHT;
      why.push(`they have reason to remember you (${grudge.causeLineId.replace(/_/g, ' ')})`);
    }
    if (household.grievance >= 0.7) {
      why.push('they are past asking nicely');
    }

    // the shift's own stream makes "recent" cheap and stable without extra state
    const rng = streamFor(opts.seed, opts.shift - 1, `recurrence:${household.id}`);
    if (rng.chance(RECENT_PENALTY)) weight *= 0.4;

    return { household, why: why[0] ?? '', weight: Math.max(0.05, weight) };
  });
}

/** The shift's line: one household, one sentence, one reason. */
export function chooseRecurrence(opts: RecurrenceOptions): Recurrence | null {
  if (opts.sector.households.length === 0) return null;

  const ranked = rankRecurrence(opts);
  const knownIds = new Set(opts.known.map((k) => k.household_id));
  const preferKnown = opts.preferKnown ?? true;

  // "prefer" rather than "require": when nobody is Known yet the district supplies its
  // own news, which is exactly what happens on a Warden's first shift
  const pool = preferKnown && knownIds.size > 0
    ? ranked.filter((c) => knownIds.has(c.household.id))
    : ranked;
  const candidates = pool.length > 0 ? pool : ranked;

  const rng = streamFor(opts.seed, opts.shift, 'recurrence');
  const chosen = rng.weighted(candidates, (c) => c.weight);
  if (!chosen) return null;

  return {
    household_id: chosen.household.id,
    line: lineFor(chosen.household),
    why: chosen.why || 'they are the loudest complaint on the list',
    known: knownIds.has(chosen.household.id),
  };
}

/**
 * What the street would say. Never a status, always a happening: a household is a
 * fact and a line is a story, and only the second one is worth reading.
 */
export function lineFor(household: Household): string {
  const where = household.block.replace(/_/g, ' ');
  if (household.flags.includes('available')) {
    return `Somebody from ${where} has been asking which way the patrols come.`;
  }
  if (household.flags.includes('informant')) {
    return `The house on ${where} with the shut curtain has been watching the corner again.`;
  }
  if (household.grievance >= 0.7) {
    return `${where} has stopped opening the door to the ration clerk.`;
  }
  if (household.grievance >= 0.45) {
    return `A complaint from ${where} went in at the desk and then went quiet.`;
  }
  if (household.housing === 'requisitioned') {
    return `The ${where} house has been emptied and somebody is still sleeping in it.`;
  }
  return `Nothing from ${where}, which the Warden has learned to hear as something.`;
}

/* ------------------------------------------------------------- the host */

/**
 * The household whose door the incident is behind.
 *
 * This is the hop that makes recurrence worth building: `chooseRecurrence()` says who
 * is in the news, and this says *where the raid goes*. They are separate questions —
 * the news is what the Warden hears, the raid is where they end up — and separating
 * them is what stops the game feeling like it is reading out its own dice.
 *
 * Returns null when the district has nobody available, so the caller falls back to the
 * authored address rather than inventing a household.
 */
export function hostForIncident(opts: RecurrenceOptions): Household | null {
  const choice = chooseRecurrence(opts);
  if (!choice) return null;
  return opts.sector.households.find((h) => h.id === choice.household_id) ?? null;
}

/**
 * The address a Warden would actually read out. The authored label plus the district's
 * own description, so "Block C, flat fourteen" becomes a place with a household in it
 * rather than a placename from a map file.
 */
export function raidAddress(base: string, household: Household | null): string {
  if (!household) return base;
  return `${base} · ${household.block.replace(/_/g, ' ')} ${household.id}`;
}
