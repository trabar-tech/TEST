/**
 * Households, agent materialisation and the Known set (SYS-SIM-01 §2, §2.1, §4).
 *
 * The sector is 60 households, not 60 characters. Each household is a *record*:
 * who lives there, what they owe the ration office, what they are hiding, and how
 * close to the edge they are. Characters are derived from those records on demand
 * and thrown away again — which is why the mother from the flat you cleared on
 * Monday can be the woman you arrest on Tuesday without anybody having authored a
 * relationship between the two.
 *
 * Two design commitments, both load-bearing:
 *
 *  - **Determinism.** `materialise()` is a pure function of (seed, household id).
 *    No state, no ordering, no allocation-order accidents. Calling it twice gives
 *    the same citizen; calling it after 40 arrests gives the same citizen.
 *  - **The 12 cap is a budget, not a limit.** The Known set holds at most 12
 *    people. Eviction is *visible*: the roster shrinks, a gap opens in the
 *    registry, and the player notices. That is the cheapest emotional beat in the
 *    game (research R-1), so it is modelled as `KnownSet` rather than as a filter.
 */

import { hashString, mix32, streamFor, type Rng } from '@core/rng';
import type { Papers } from '@core/content';

export const KNOWN_CAP = 12;

export const HOUSING = ['secure', 'crowded', 'condemned', 'requisitioned'] as const;
export type Housing = (typeof HOUSING)[number];

export const RATION_CLASSES = ['A', 'B', 'C', 'D'] as const;
export type RationClass = (typeof RATION_CLASSES)[number];

/** Named secrets, because "unlicensed printing" is a story and `secret: 3` is not. */
export const SECRETS = [
  'unlicensed_printing',
  'hiding_a_deserter',
  'unregistered_child',
  'syndicate_debt',
  'cell_money',
  'sick_untreated',
  'radio_listening',
  'ration_fraud',
] as const;
export type Secret = (typeof SECRETS)[number];

export interface Household {
  id: string;
  block: string;
  members: number;
  ration_class: RationClass;
  housing: Housing;
  /** 0 = will inform, 1 = will hide a stranger; the mean is sector legitimacy */
  loyalty: number;
  secret: Secret | null;
  flags: string[];
  /** 0–1; drives faction recruitment, notices, and the temperature floor */
  grievance: number;
}

/* ------------------------------------------------------------ the sector */

export interface SectorState {
  id: string;
  shift: number;
  households: Household[];
  /** force index carried over from the tactical layer (see `sector.ts`) */
  force_index: number;
  supply_deficit: number;
  /** 0–1, mean of faction antagonism normalised; see `temperature()` */
  faction_heat: number;
}

export function grievancePressure(sector: SectorState): number {
  if (sector.households.length === 0) return 0;
  const total = sector.households.reduce((a, h) => a + h.grievance, 0);
  return (total / sector.households.length) * 12; // 12 points at worst-case, as specced
}

/** Legitimacy in 0–100: mean loyalty, less what the sector's grievances cost it. */
export function legitimacy(sector: SectorState): number {
  if (sector.households.length === 0) return 0;
  const mean = sector.households.reduce((a, h) => a + h.loyalty, 0) / sector.households.length;
  return clamp(mean * 100 - grievancePressure(sector), 0, 100);
}

export const MAX_FORCE = 20;

/**
 * The sector's one legible number. Deliberately a weighted sum and not a model:
 * the player is meant to read this like weather, through colour grade and barks,
 * never through a meter (SYS-SIM-01 §3).
 */
export function temperature(sector: SectorState): number {
  // A district with nobody in it has no pressure to report. Returning the
  // neutral 50 would make "evacuated" read as "half-hostile".
  if (sector.households.length === 0) return 0;
  const t =
    0.5 * (100 - legitimacy(sector)) +
    0.2 * clamp(sector.force_index / MAX_FORCE, 0, 1) * 100 +
    0.15 * clamp(sector.supply_deficit, 0, 1) * 100 +
    0.15 * clamp(sector.faction_heat, 0, 1) * 100;
  return Math.round(clamp(t, 0, 100));
}

export type Grade = 'calm' | 'wary' | 'braced' | 'hostile';

/** The colour-grade vocabulary, so the renderer and the barks cannot disagree. */
export function grade(sector: SectorState): Grade {
  const t = temperature(sector);
  if (t < 35) return 'calm';
  if (t < 55) return 'wary';
  if (t < 75) return 'braced';
  return 'hostile';
}

/* --------------------------------------------------------- the generator */

export interface HouseholdOptions {
  seed: number;
  /** 60 in the slice; the doc's cut line takes it to 40 before anything else */
  count?: number;
  blocks?: readonly string[];
}

const DEFAULT_BLOCKS = [
  'tenement_row',
  'kiln_row_block_a',
  'canal_market',
  'laundry_yard',
  'workshop_se',
] as const;

/**
 * Generate a sector's households from a seed. Stable for a seed, which means the
 * campaign's district is authored once and never re-rolled on load.
 *
 * Grievance is *not* uniform: it correlates with ration class and housing,
 * because a district that is angry at random does not feel unfair, it feels noisy.
 */
export function generateSector(opts: HouseholdOptions): SectorState {
  const count = opts.count ?? 60;
  const blocks = opts.blocks ?? DEFAULT_BLOCKS;
  const rng = streamFor(opts.seed, 0, 'sector-gen');
  const households: Household[] = [];

  for (let i = 0; i < count; i++) {
    // A household's identity is its index, not its draw order, so changing the
    // count later does not renumber everyone (saves stay loadable).
    const id = `h-${String(i + 1).padStart(3, '0')}`;
    const hRng = householdRng(opts.seed, id);

    const ration_class = hRng.pick(RATION_CLASSES)!;
    const housing = hRng.weighted(HOUSING, (h) =>
      h === 'crowded' ? 4 : h === 'secure' ? 3 : h === 'condemned' ? 1.5 : 0.6,
    )!;
    const base = ration_class === 'D' ? 0.55 : ration_class === 'C' ? 0.45 : 0.3;
    const housingLift = housing === 'condemned' ? 0.2 : housing === 'requisitioned' ? 0.15 : 0;
    const grievance = clamp(base + housingLift + hRng.next() * 0.3 - 0.1, 0, 1);
    const hasSecret = hRng.chance(0.35);

    households.push({
      id,
      block: blocks[i % blocks.length]!,
      members: hRng.int(1, 5),
      ration_class,
      housing,
      // loyalty runs against grievance, so legitimacy and temperature cannot both
      // be gamed by the same action
      loyalty: clamp(0.85 - grievance * 0.6 + (hRng.next() - 0.5) * 0.2, 0, 1),
      secret: hasSecret ? hRng.pick(SECRETS)! : null,
      flags: housing === 'requisitioned' ? ['notice_served'] : [],
      grievance,
    });
  }

  void rng;
  return {
    id: 'kiln_row',
    shift: 0,
    households,
    force_index: 0,
    supply_deficit: 0.18,
    faction_heat: 0.2,
  };
}

/** Household-local stream: same household, same draw, whatever the sector size. */
export function householdRng(seed: number, id: string): Rng {
  return streamFor(mix32(seed >>> 0, hashString(id)), 0, 'household');
}

/* ------------------------------------------------------ materialisation */

export const TEMPERAMENTS = ['afraid', 'indignant', 'rehearsed', 'drunk', 'helpful'] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];

const GIVEN = ['M.', 'T.', 'L.', 'S.', 'R.', 'A.', 'N.', 'D.', 'V.', 'K.', 'I.', 'P.'];
const FAMILY = [
  'Ostrow', 'Branik', 'Sorokin', 'Iordanov', 'Adeniyi', 'Petrescu', 'Vask', 'Havel',
  'Osen', 'Marek', 'Duman', 'Sisko', 'Rask', 'Vance', 'Toma', 'Bakker',
];
const ARCHETYPES = [
  'laundry worker', 'press operator', 'ration clerk', 'porter', 'machinist',
  'schoolteacher', 'boiler man', 'seamstress', 'carter', 'clerk',
];

export interface MaterialisedAgent {
  household_id: string;
  name: string;
  /** stable per person: the portrait is a function of this */
  face_seed: number;
  temperament: Temperament;
  papers: Papers;
  knowledge: string[];
  /** a one-line history, in the register the Registry actually uses */
  note: string;
  /** block + post, for the tactical layer's routine templates */
  post: string;
}

/**
 * Turn a household record into a person. Pure: (sector seed, household) →
 * agent. Papers can contain a real irregularity, and when they do it is the
 * *household's* secret showing through, not a fresh random failure.
 *
 * The `name_seed` is a number so that the same surname lands on the same
 * household across shifts; names are drawn from the household stream, not the
 * shift stream, or the cast would reshuffle every morning.
 */
export function materialise(sector: SectorState, householdId: string, seed: number): MaterialisedAgent {
  const household = sector.households.find((h) => h.id === householdId);
  if (!household) throw new Error(`materialise: no household ${householdId}`);

  const rng = householdRng(seed, householdId);
  const given = rng.pick(GIVEN)!;
  const family = rng.pick(FAMILY)!;
  const name = `${given} ${family}`;
  const archetype = rng.pick(ARCHETYPES)!;
  const face_seed = rng.int(0, 0xffff);

  // Temperament tracks grievance: an angry household produces indignant people,
  // a frightened one produces afraid ones. The correlation is the characterisation.
  const temperament: Temperament = household.grievance > 0.65
    ? (rng.chance(0.6) ? 'indignant' : 'rehearsed')
    : household.grievance > 0.4
      ? (rng.chance(0.5) ? 'afraid' : 'helpful')
      : (rng.pick(TEMPERAMENTS) ?? 'afraid');

  const chipClass = household.ration_class;
  const papers: Papers = {
    name,
    district_stamp: `S4`,
    ration_class: household.ration_class,
    work_permit: `${archetype.split(' ')[0]}-${rng.int(1, 7)}`,
    curfew_pass: household.housing === 'secure' || rng.chance(0.6),
    chip_serial: `${chipClass}-${String(rng.int(1000, 9999))}-${rng.int(0, 9)}`,
  };

  // One irregularity, and only where the household has something to hide.
  if (household.secret && rng.chance(household.grievance > 0.5 ? 0.55 : 0.3)) {
    const field = rng.pick(['district_stamp', 'curfew_pass', 'ration_class', 'chip_serial'] as const)!;
    if (field === 'curfew_pass') papers.curfew_pass = false;
    else if (field === 'district_stamp') papers.district_stamp = 'S3';
    else if (field === 'ration_class') papers.ration_class = household.ration_class === 'D' ? 'C' : 'D';
    else papers.chip_serial = `B-${String(rng.int(1000, 9999))}-${rng.int(0, 9)}`;
  }

  const knowledge: string[] = [];
  if (household.secret) knowledge.push(`secret:${household.secret}`);
  if (household.flags.includes('informant')) knowledge.push('informant');
  if (household.loyalty < 0.25) knowledge.push('cell_sympathiser');

  return {
    household_id: household.id,
    name,
    face_seed,
    temperament,
    papers,
    knowledge,
    note: describeHousehold(household),
    post: household.block,
  };
}

/** The Registry's one-liner: household first, person implied. */
export function describeHousehold(h: Household): string {
  const people = h.members === 1 ? '1 registered occupant' : `${h.members} registered occupants`;
  const secret = h.secret ? `; ${SECRET_WORDS[h.secret]}` : '';
  return `${h.block.replace(/_/g, ' ')}, ${h.housing}, class ${h.ration_class} — ${people}${secret}`;
}

const SECRET_WORDS: Record<Secret, string> = {
  unlicensed_printing: 'press heard after curfew',
  hiding_a_deserter: 'one more mouth than the registry accounts for',
  unregistered_child: 'a child with no line in the book',
  syndicate_debt: 'paying the canal route',
  cell_money: 'money that does not come from work',
  sick_untreated: 'a cough that will not stop',
  radio_listening: 'an aerial nobody admits to',
  ration_fraud: 'rations collected twice',
};

/* ---------------------------------------------------------------- Known */

export interface KnownEntry {
  household_id: string;
  /** the shift they entered the set, so the roster can say how long they lasted */
  since: number;
  /** why they are Known — always a claim the player made, never a hidden fact */
  reason: string;
  /** non-zero while the gap left by an eviction is still fresh */
  slot?: number;
}

export interface Eviction {
  household_id: string;
  reason: string;
  shift: number;
}

/**
 * The Known set: at most 12 people, with visible eviction.
 *
 * Eviction is *least-recently-referenced*, not random and not lowest-value: the
 * person who slips out of the Warden's head is the one they have not thought
 * about, which is both fair and quietly cruel. `gap()` reports the empty slots so
 * the UI can show a hole in the roster rather than a quietly shorter list.
 */
export class KnownSet {
  private entries: KnownEntry[] = [];
  private history: Eviction[] = [];

  constructor(readonly cap = KNOWN_CAP) {}

  get size(): number {
    return this.entries.length;
  }

  get isFull(): boolean {
    return this.entries.length >= this.cap;
  }

  all(): KnownEntry[] {
    return [...this.entries];
  }

  has(id: string): boolean {
    return this.entries.some((e) => e.household_id === id);
  }

  /** Empty slots, as indices into the roster. The UI draws these as gaps. */
  gap(): number[] {
    const gaps: number[] = [];
    for (let i = this.entries.length; i < this.cap; i++) gaps.push(i);
    return gaps;
  }

  evictions(): Eviction[] {
    return [...this.history];
  }

  /**
   * Add someone. Returns the evicted entry, if adding them pushed someone out.
   * Re-adding someone already Known refreshes their `since` rather than duplicating.
   */
  add(entry: { household_id: string; reason: string }, shift: number): Eviction | null {
    const existing = this.entries.find((e) => e.household_id === entry.household_id);
    if (existing) {
      existing.since = shift;
      existing.reason = entry.reason;
      // move to the back: they have just been thought about
      this.entries = [...this.entries.filter((e) => e !== existing), existing];
      return null;
    }

    this.entries.push({ household_id: entry.household_id, since: shift, reason: entry.reason });
    if (this.entries.length <= this.cap) return null;

    const evictedIndex = this.pickEviction();
    const [evicted] = this.entries.splice(evictedIndex, 1);
    const record: Eviction = {
      household_id: evicted!.household_id,
      reason: evicted!.reason,
      shift,
    };
    this.history.push(record);
    return record;
  }

  /** Least-recently-referenced; ties break on earliest arrival. */
  private pickEviction(): number {
    let best = 0;
    for (let i = 1; i < this.entries.length; i++) {
      const a = this.entries[i]!;
      const b = this.entries[best]!;
      if (a.since < b.since) best = i;
    }
    return best;
  }

  /** Remove someone outright (moved on, died, went silent). Leaves a real gap. */
  remove(id: string, reason: string, shift: number): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.household_id !== id);
    if (this.entries.length === before) return false;
    this.history.push({ household_id: id, reason, shift });
    return true;
  }

  clear(): void {
    this.entries = [];
  }

  /** For saves: the set is small, so it travels whole. */
  toJSON(): { entries: KnownEntry[]; history: Eviction[] } {
    return { entries: [...this.entries], history: [...this.history] };
  }

  static fromJSON(data: { entries?: KnownEntry[]; history?: Eviction[] }, cap = KNOWN_CAP): KnownSet {
    const set = new KnownSet(cap);
    set.entries = (data.entries ?? []).slice(0, cap);
    set.history = data.history ?? [];
    return set;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
