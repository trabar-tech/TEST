/**
 * The bridge: an incident becomes exactly one report line (P2-T08).
 *
 * This file is the whole argument of the tactical layer. An incident does not
 * "give you loot"; it gives you **one line you have to write**, and every fact
 * the scene produced — the noise a neighbour heard, the door you broke, the man
 * nobody found, the force you used — is a field in that line. You can still lie
 * about it. That is the game.
 *
 * Three rules, and they are the ones the tests defend:
 *
 *  1. **One line per rung-2+ action is already in the record's hands**: the
 *     incident's `forceUsed` list is what the line's `force_tool` and
 *     `force_rung` come from, so a brutal entry cannot be filed as a quiet one
 *     without a *claim* that contradicts a tag the log can see.
 *  2. **The default draft is the honest one.** The player's lie is an edit, not
 *     a default — the same rule Phase 1 used for inspections.
 *  3. **The unfiled incident is not free.** If nothing is filed, the auto-filing
 *     writes the truth with the worst possible spin, which is a silence you can
 *     hear in the debrief.
 */

import type { Claim, Classification, ReportLine, Truth } from '@core/record';
import type { IncidentResult } from './incident';
import type { CrowdDef, CrowdState } from './crowd';
import type { ForceRung } from './types';

export interface IncidentDocket {
  ref: string;
  kind: 'incident';
  title: string;
  note: string;
  truth: Truth;
  cameras: string[];
  witnesses: Array<{ id: string; reliability: number; will_talk: number }>;
  quota: number;
  draft: Claim;
  tags_hint: string[];
  /** the incident's own facts, kept for the desk's "what the scene produced" panel */
  scene: DocketSceneForCard;
  /**
   * The household this happened at, when the scene was bound to the district (P3-T02).
   * Carried through so the desk can show whose door it was and the district can be
   * charged for it.
   */
  householdId?: string;
}

/** The smaller, desk-facing shape the docket card carries (see `shift.ts`). */
export interface DocketSceneForCard {
  entry: string;
  roomsCleared: number;
  roomsClaimed: number;
  roomsActuallyClear: number;
  loudestNoise: number;
  heardByNeighbours: number;
  damage: number;
  wallsBreached: number;
  unfound: number;
  stabilised: number;
  unauthorisedForce: boolean;
}

export interface IncidentWitness {
  id: string;
  reliability: number;
  will_talk: number;
}

export interface PaperworkOptions {
  ref: string;
  address: string;
  result: IncidentResult;
  /** the highest rung used, if any force was used */
  highestRung?: ForceRung;
  witnesses?: IncidentWitness[];
  cameras?: string[];
  /** the crowd, if the incident was a crowd event (P2-T07) */
  crowdArrests?: number;
}

/**
 * The honest classification of a scene.
 *
 * P — nothing found, nobody detained, nothing broken.
 * C — a contraband/paperwork finding, no arrest.
 * D — a detention.
 * R — resistance-linked: force was used against someone who fought.
 * B — both a finding and a detention.
 */
export function classifyIncident(result: IncidentResult): Classification {
  const force = result.forceUsed.length;
  const found = result.damage > 0 || result.unfound.length === 0 ? true : false;
  if (result.detainees > 0 && force >= 2) return 'R';
  if (result.detainees > 0) return found ? 'B' : 'D';
  if (result.damage > 3 && force === 0) return 'C';
  return 'P';
}

/** The one-line-per-rung rule: the tag comes from the highest rung actually used. */
export function toolTagFor(result: IncidentResult): string | undefined {
  if (result.forceUsed.length === 0) return undefined;
  const highest = result.forceUsed.reduce((a, b) => (b.rung > a.rung ? b : a));
  return highest.logTag ?? undefined;
}

export function highestRung(result: IncidentResult): ForceRung {
  return result.forceUsed.reduce<ForceRung>((a, b) => (b.rung > a ? b.rung : a), 1);
}

export function truthFromIncident(result: IncidentResult): Truth {
  const rung = highestRung(result);
  return {
    classification: classifyIncident(result),
    force_rung: rung,
    ...(toolTagFor(result) === undefined ? {} : { force_tool: toolTagFor(result)! }),
    detainees: result.detainees,
    casualties: result.casualties,
    damage: Math.min(3, result.damage),
    property: propertyList(result),
    third_party_present: result.heardByNeighbours > 0,
    illegal_search: result.wallsBreached > 0,
    bribe_taken: false,
  };
}

/**
 * Property is where the tactical layer's details become *auditable*. A neighbour
 * who heard the ram is a third party; a wall you went through without a warrant
 * is an illegal search; a door you shot open is damage to property. None of this
 * is flavour text — each item is a thing the audit can prove.
 */
export function propertyList(result: IncidentResult): string[] {
  const out: string[] = ['door_damage'];
  if (result.damage >= 3) out.push('structural_damage');
  if (result.wallsBreached > 0) {
    // `illegal_search` is the token `slack()` charges for, so the honest draft has
    // to carry it; `forced_wall` is the readable version beside it
    out.push('illegal_search', 'forced_wall');
  }
  if (result.heardByNeighbours > 0) {
    out.push('third_party', 'audible_from_street');
  }
  if (result.unauthorisedForce) out.push('force_without_authorisation');
  const isLoud = result.entryMethod === 'ram' || result.entryMethod === 'shotgun';
  if (isLoud) out.push('noise_complaint_risk');
  if (result.unfound.length > 0) out.push('premises_not_fully_searched');
  return out;
}

/**
 * The draft the player starts from. Honest by construction; the only thing
 * already softened is the *classification*, because that is the choice the desk
 * is for.
 */
export function draftFromIncident(result: IncidentResult): Claim {
  return {
    classification: classifyIncident(result),
    force_rung: highestRung(result),
    ...(toolTagFor(result) === undefined ? {} : { force_tool: toolTagFor(result)! }),
    detainees: result.detainees,
    casualties: result.casualties,
    damage: Math.min(3, result.damage),
    property: propertyList(result),
  };
}

/** The docket card, in the same shape the desk already renders. */
export function incidentDocket(opts: PaperworkOptions): IncidentDocket {
  const truth = truthFromIncident(opts.result);
  const rung = highestRung(opts.result);
  return {
    ref: opts.ref,
    kind: 'incident',
    title: opts.address,
    note: sceneNote(opts.result, rung),
    truth,
    cameras: opts.cameras ?? [],
    witnesses: opts.witnesses ?? [],
    quota: 1,
    draft: draftFromIncident(opts.result),
    tags_hint: incidentTags(opts.result),
    scene: cardScene(opts.result),
  };
}

/** What the Warden would write if they were being straight with the file. */
export function sceneNote(result: IncidentResult, rung: ForceRung): string {
  const bits: string[] = [];
  bits.push(`Entry by ${entryName(result.entryMethod)}.`);
  bits.push(
    result.roomClaims.filter((r) => r.claimedClear).length > 0
      ? `${result.roomClaims.filter((r) => r.claimedClear).length} rooms cleared.`
      : 'No rooms cleared.',
  );
  if (result.detainees > 0) bits.push(`${result.detainees} detained.`);
  if (rung >= 2) bits.push(`Force: ${rungName(rung)}.`);
  if (result.damage >= 2) bits.push('The door did not survive.');
  if (result.heardByNeighbours > 0) bits.push('The street heard it.');
  return bits.join(' ');
}

function rungName(rung: ForceRung): string {
  return { 1: 'presence only', 2: 'control', 3: 'compliance', 4: 'lethal', 5: 'collective' }[rung];
}

function entryName(method: IncidentResult['entryMethod']): string {
  return {
    knock_talk: 'knock and talk',
    stack_enter: 'stack and enter',
    split_entry: 'split entry',
    roof_window: 'roof or window',
    ram: 'ram',
    shotgun: 'shotgun',
    gas_wait: 'gas, then wait',
    shout_out: 'shout out',
  }[method];
}

export function incidentTags(result: IncidentResult): string[] {
  const out: string[] = [];
  const rung = highestRung(result);
  if (rung >= 3) out.push('excessive_force_risk');
  if (rung >= 4) out.push('lethal_force');
  if (result.unauthorisedForce) out.push('no_authorisation');
  return out;
}

/**
 * What the audit can prove about a *door* (P2-T01's link to the paperwork).
 * Kept separate from the claim so the desk can show it in the gutter: "a
 * neighbour heard this" is a fact about the world, not a field you can edit.
 */
/**
 * The scene, in the shape a filed line keeps. Exported so tests and the desk
 * agree with the audit about what a scene is, rather than three copies drifting.
 */
/** `IncidentResult` → the card shape (a superset of the filed `SceneFacts`). */
export function cardScene(result: IncidentResult): DocketSceneForCard {
  const claims = result.roomClaims;
  return {
    entry: result.entryMethod,
    roomsClaimed: claims.filter((r) => r.claimedClear).length,
    roomsActuallyClear: claims.filter((r) => r.actuallyClear).length,
    roomsCleared: claims.filter((r) => r.claimedClear).length,
    loudestNoise: result.loudestNoise,
    heardByNeighbours: result.heardByNeighbours,
    damage: result.damage,
    wallsBreached: result.wallsBreached,
    unfound: result.unfound.length,
    stabilised: result.stabilised.length,
    unauthorisedForce: result.unauthorisedForce,
  };
}

export function sceneFacts(result: IncidentResult): NonNullable<ReportLine['scene']> {
  return {
    entry: result.entryMethod,
    roomsCleared: result.roomClaims.filter((r) => r.claimedClear).length,
    roomsActuallyClear: result.roomClaims.filter((r) => r.actuallyClear).length,
    loudestNoise: result.loudestNoise,
    heardByNeighbours: result.heardByNeighbours,
    damage: result.damage,
    wallsBreached: result.wallsBreached,
    unfound: result.unfound.length,
    stabilised: result.stabilised.length,
    unauthorisedForce: result.unauthorisedForce,
  };
}

/**
 * A crowd event becomes a card too (P2-T07). It has no doors and no subjects, so
 * its "scene" is the only thing that matters: how hot it got, whether anyone was
 * taken, and what the Directorate will ask about it. Filing it is still one line,
 * because one vocabulary for every event is the point.
 */
export function crowdDocket(opts: {
  ref: string;
  address: string;
  crowd: CrowdDef;
  arrests: number;
  peakState: CrowdState;
  legitimacy: number;
  officers?: number;
}): IncidentDocket {
  const dispersed = opts.crowd.state === 'dispersing' || opts.crowd.state === 'milling';
  const noArrests = opts.arrests === 0;
  const classification: Classification = noArrests ? (dispersed ? 'P' : 'NR') : 'D';
  const property: string[] = ['crowd_hazard'];
  if (dispersed) property.push('crowd_dispersed');
  if (!dispersed) property.push('crowd_not_dispersed');
  if (opts.officers === undefined) property.push('third_party');

  const claim: Claim = {
    classification,
    force_rung: dispersed ? 1 : 2,
    detainees: opts.arrests,
    casualties: 0,
    damage: 0,
    property,
  };
  const truth: Truth = {
    ...claim,
    property: undefined,
    third_party_present: true,
    illegal_search: false,
    bribe_taken: false,
  };
  return {
    ref: opts.ref,
    kind: 'incident',
    title: opts.address,
    note:
      `Crowd of ${opts.crowd.agents}, grievance ${opts.crowd.grievance.replace(/_/g, ' ')}. ` +
      `Peaked at ${opts.peakState}. ` +
      (opts.arrests === 0
        ? 'Dispersed with no detentions.'
        : `${opts.arrests} detained.`),
    truth,
    cameras: [],
    witnesses: [],
    quota: 1,
    draft: claim,
    tags_hint: dispersed ? ['crowd'] : ['crowd', 'resisting'],
    scene: {
      entry: 'crowd',
      roomsClaimed: 0,
      roomsCleared: 0,
      roomsActuallyClear: 0,
      loudestNoise: Math.round(opts.crowd.heat * 10),
      heardByNeighbours: 1,
      damage: 0,
      wallsBreached: 0,
      unfound: 0,
      stabilised: 0,
      unauthorisedForce: false,
    },
  };
}

export function audibleEvidence(result: IncidentResult): {
  heard: boolean;
  loudest: number;
  text: string;
} {
  return {
    heard: result.heardByNeighbours > 0,
    loudest: result.loudestNoise,
    text:
      result.heardByNeighbours > 0
        ? `A noise of ${result.loudestNoise} tiles was audible from the street, ${result.heardByNeighbours} time(s). A neighbour can testify to that.`
        : 'Nothing left the flat that a neighbour could swear to.',
  };
}
