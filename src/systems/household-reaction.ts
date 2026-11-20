/**
 * What the district does about what you did (SYS-SIM-01 §3 step 4).
 *
 * The street→district binding teaches the player where people live. This is the other
 * direction, and it is the one that makes the city feel like it *remembers*: an arrest
 * raises a household's grievance, grievance hardens a household into a complaint or a
 * silent house, and the temperature follows.
 *
 * Three rules, all of them necessary:
 *
 *  1. **Only claims.** A household reacts to what the player *filed*, never to what
 *     happened. This is not a limitation, it is the thesis: the city is what the
 *     paperwork says it is. A brutality nobody wrote down did not, officially, occur —
 *     and when it does come out later, the reaction is larger because it was hidden.
 *  2. **Neighbours, not just the target.** The household next door reacts a third as
 *     much. Punishment that only touches one door is not a district; it is a queue.
 *  3. **Nothing decays faster than it accumulates.** Grievance is sticky: what you do
 *     outlasts what you say. Two quiet shifts cools a household by less than one bad
 *     night heats it, which is why the place gets worse rather than merely noisy.
 */

import type { Classification } from '@core/record';
import type { Household, SectorState } from './households';

/** How much one filed line moves a household's grievance, by classification. */
export const REACTIONS: Record<Classification, number> = {
  /** cleared: the household is relieved, marginally */
  C: -0.06,
  /** passed, no action: the best outcome a district can hope for */
  P: 0,
  /** detained: somebody did not come home */
  D: 0.22,
  /** not resolved / unresolved: suspicion with no answer, which is its own weather */
  NR: 0.08,
  /** refused, no grounds: an insult rather than an injury */
  R: 0.03,
  /** bribe taken: the household learns the price of its own officer */
  B: 0.05,
  /** nothing happened: filing nothing is not the same as doing nothing */
  '-': 0.02,
  /** no answer: the Warden walked away, and the street noticed */
  X: 0.04,
};

/** A neighbour's share of the same event. Enough to feel, not enough to flood. */
export const NEIGHBOUR_SHARE = 0.34;

export interface FiledAct {
  household_id: string;
  classification: Classification;
  /** extra weight for force at rung 4+, which the street talks about for weeks */
  force_rung?: number;
}

export interface ReactionOptions {
  sector: SectorState;
  acts: readonly FiledAct[];
}

export interface Reaction {
  sector: SectorState;
  /** households whose grievance moved, for the debrief and the Registry */
  changed: Array<{ household_id: string; delta: number; grievance: number }>;
  /** the single sentence the district would say about tonight, if it spoke */
  summary: string;
  /**
   * The household that took it worst, if any — carried so the debrief can put a door
   * to the number. Null when nothing changed, which is its own answer.
   */
  worst: { household_id: string; block: string; delta: number; grievance: number } | null;
}

/**
 * Apply one shift's filed acts to the district.
 *
 * Deterministic and order-independent: the delta a household receives is the *sum* of
 * every act that touched it, so filing the same three lines in a different order
 * cannot produce a different city.
 */
export function reactToFilings(opts: ReactionOptions): Reaction {
  const byId = new Map(opts.sector.households.map((h) => [h.id, h]));
  const deltas = new Map<string, number>();

  for (const act of opts.acts) {
    const target = byId.get(act.household_id);
    if (!target) continue;
    const forceLift = (act.force_rung ?? 0) >= 4 ? 0.12 : 0;
    const magnitude = REACTIONS[act.classification] + (REACTIONS[act.classification] > 0 ? forceLift : 0);

    deltas.set(target.id, (deltas.get(target.id) ?? 0) + magnitude);

    // neighbours: same block, one step away, a third of the effect
    for (const other of opts.sector.households) {
      if (other.id === target.id || other.block !== target.block) continue;
      deltas.set(other.id, (deltas.get(other.id) ?? 0) + magnitude * NEIGHBOUR_SHARE);
    }
  }

  const changed: Reaction['changed'] = [];
  const households = opts.sector.households.map((h) => {
    const raw = deltas.get(h.id);
    if (raw === undefined) return h;
    const next = clamp(h.grievance + raw, 0, 1);
    if (Math.abs(next - h.grievance) < 0.001) return h;
    changed.push({ household_id: h.id, delta: round(next - h.grievance), grievance: round(next) });
    return { ...h, grievance: round(next) };
  });

  const hardest = [...changed].filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  return {
    sector: { ...opts.sector, households },
    changed,
    summary: summarise(changed, byId),
    worst: hardest
      ? { ...hardest, block: byId.get(hardest.household_id)?.block ?? 'kiln_row' }
      : null,
  };
}

/**
 * The district's own sentence. Deliberately not a percentage or a bar: this is the line
 * a briefer would actually say, and it is what makes the number legible as a place.
 */
function summarise(changed: Reaction['changed'], byId: Map<string, Household>): string {
  if (changed.length === 0) return 'The district took no notice of tonight, which is its own kind of notice.';
  const worst = [...changed].sort((a, b) => b.delta - a.delta)[0];
  if (!worst || worst.delta <= 0) {
    return 'Two households are easier tonight. Nobody thanks you for it.';
  }
  const block = byId.get(worst.household_id)?.block.replace(/_/g, ' ') ?? 'the district';
  const spread = new Set(changed.map((c) => byId.get(c.household_id)?.block)).size;
  return `${block} is angry, and ${spread === 1 ? 'the neighbours are watching' : `${spread} blocks have heard about it`}.`;
}

/**
 * The slow turn: grievance hardens into a *state*, which is what a faction can use.
 *
 * Applied per shift, after the reaction. A household that stays above 0.7 for long
 * enough is no longer angry, it is *available* — and availability is what the Cell's
 * recruitment step looks for.
 */
export interface Hardening {
  household: Household;
  became: 'available' | 'informant' | null;
}

/**
 * Shifts a household must spend above the line before it is *available*.
 *
 * This constant is the whole difference between "the slow turn" the design describes and
 * what the code actually did. `harden()` used to promote on a single crossing of 0.7, and
 * after one refusal one household crossed and took its block with it through the
 * neighbour share: six households became available in one night, from one line. The
 * campaign runner found it in the first hour of its life, which is exactly what it is for.
 */
export const TURN_SHIFTS = 3;

export function harden(household: Household): Hardening {
  const angryNights = household.flags.filter((f) => f === 'angry').length;

  if (household.grievance >= 0.7 && !household.flags.includes('available')) {
    // below the turn: record the night and wait. A household that cools off loses the
    // streak entirely, so grievance has to be *sustained* to become a state.
    if (angryNights + 1 < TURN_SHIFTS) {
      return { household: { ...household, flags: [...household.flags, 'angry'] }, became: null };
    }
    return { household: { ...household, flags: [...household.flags, 'available'] }, became: 'available' };
  }

  if (household.grievance <= 0.12 && household.loyalty > 0.7 && !household.flags.includes('informant')) {
    return { household: { ...household, flags: [...household.flags, 'informant'] }, became: 'informant' };
  }

  // cooled off: the surveillance that was building evaporates
  if (household.grievance < 0.7 && angryNights > 0) {
    return { household: { ...household, flags: household.flags.filter((f) => f !== 'angry') }, became: null };
  }

  return { household, became: null };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
