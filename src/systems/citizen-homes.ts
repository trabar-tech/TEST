/**
 * Where the street's citizens live, and what happens when you learn it.
 *
 * Until now the sector's sixty households and the street's six citizens were
 * unrelated data. That is a quiet catastrophe for the design: the sim doc's promise
 * — "the person you arrest on Tuesday is the mother from the flat you cleared on
 * Monday" — is *provably false* if the street's cast never touches the district's
 * records. Materialisation being pure is not enough; the two sets have to be the
 * same people, or the continuity is a sentence in a document.
 *
 * This module binds them. Each slice citizen is assigned a home household
 * deterministically from the campaign seed and the citizen id, so:
 *
 *   - a citizen seen on the street is *always* the same household, across reloads;
 *   - inspecting them is how the player learns which household that is;
 *   - meeting them twice (or filing a line naming them) puts the household in the
 *     Known set — and the household can then be materialised as the person you meet
 *     in the flat on Monday, because it is the same record.
 *
 * The assignment deliberately uses the citizen stream, not the household stream, so
 * adding households later cannot silently re-home anyone. People do not move because
 * the district grew.
 */

import { streamFor } from '@core/rng';
import type { CitizenDef } from './citizens';
import type { Household, SectorState } from './households';

/** The post a citizen keeps, which is also the hint at where they live. */
const POST_TO_BLOCK: Record<string, string> = {
  laundry: 'laundry_yard',
  workshop_se: 'workshop_se',
  ration_queue: 'canal_market',
  kiosk: 'canal_market',
  tenement_ne: 'tenement_row',
  bench_line: 'kiln_row_block_a',
};

export interface CitizenHome {
  citizen_id: string;
  household_id: string;
  household: Household;
  /** true when the two records disagree about anything that matters */
  discrepancy: string | null;
}

/**
 * Assign a stable home to one citizen.
 *
 * Preference order, and each step exists for a reason:
 *  1. a household in the same block as their post, if there is one — the street's
 *     own geography should not lie about where people sleep;
 *  2. failing that, any household, because a citizen with no home is worse than an
 *     improbable one;
 *  3. the choice is seeded by the citizen id, so it never drifts.
 */
export function homeFor(sector: SectorState, seed: number, citizen: CitizenDef): CitizenHome | null {
  const rng = streamFor(seed, 0, `home:${citizen.id}`);

  const block = POST_TO_BLOCK[citizen.post] ?? null;
  const sameBlock = block ? sector.households.filter((h) => h.block === block) : [];
  const pool = sameBlock.length > 0 ? sameBlock : sector.households;
  if (pool.length === 0) return null;

  const household = rng.pick(pool)!;
  return {
    citizen_id: citizen.id,
    household_id: household.id,
    household,
    discrepancy: describeDiscrepancy(citizen, household),
  };
}

/**
 * What the street's citizen says versus what the household record says.
 *
 * A Warden who learns both can *see* the difference, and that difference is a line
 * they can write — which is the whole game. It is deliberately not a trap: the gap
 * is reported at the severity the papers already show, never as a hidden fact.
 */
export function describeDiscrepancy(citizen: CitizenDef, household: Household): string | null {
  const classGap = citizen.papers.ration_class !== household.ration_class;
  const crowded = household.members > 3 && household.ration_class === 'D';
  if (classGap && crowded) {
    return `${household.members} people on a class ${household.ration_class} card, and one of them carries class ${citizen.papers.ration_class}`;
  }
  if (classGap) {
    return `this card says class ${citizen.papers.ration_class}; the household is registered as class ${household.ration_class}`;
  }
  return null;
}

/** The line the Registry and the case file both use, so they cannot disagree. */
export function describeHome(home: CitizenHome): string {
  const label = home.household.block.replace(/_/g, ' ');
  const people = home.household.members === 1 ? '1 occupant' : `${home.household.members} occupants`;
  return `${label}, ${home.household.housing}, class ${home.household.ration_class} — ${people}`;
}

/**
 * Should learning this home put the household in the Known set?
 *
 * One inspection is not a relationship; the sim doc's rule is *two* interactions, or
 * a filed line naming them. This returns the reason string when the threshold is met,
 * and null otherwise, so the caller never has to encode the rule twice.
 */
export function knownReason(
  home: CitizenHome,
  interactions: number,
  filed: boolean,
): string | null {
  if (filed) return 'a line you filed names this household';
  if (interactions >= 2) return `you have spoken to ${home.citizen_id} twice`;
  return null;
}

/**
 * Which citizens have a home in the sector, for a whole cast. Used by the Registry to
 * show the street's people *inside* the district rather than beside it.
 */
export function homesFor(
  sector: SectorState,
  seed: number,
  citizens: readonly CitizenDef[],
): CitizenHome[] {
  const homes: CitizenHome[] = [];
  for (const citizen of citizens) {
    const home = homeFor(sector, seed, citizen);
    if (home) homes.push(home);
  }
  return homes;
}
