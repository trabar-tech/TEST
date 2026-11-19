/**
 * The force continuum (P2-T05 / P2-T06).
 *
 * "Force is a cost, not a verb." Every rung above presence leaves a mark: on the
 * target's compliance, on everyone watching, on the sector's force index, and —
 * the part that matters — on exactly **one** report line. A tactical game where
 * you can be brutal without paperwork would be a different, worse game.
 *
 * Authorisation is a radio call: four seconds, logged. Rung 4 without it is an
 * automatic Compliance Review, and the player is told that *before* they press
 * the button (the gutter rule, ported to the tactical layer).
 */

import {
  RUNG_LABEL,
  RUNG_NEEDS_AUTHORISATION,
  RUNG_TOOL,
  RUNG_WEIGHT,
  type ForceRung,
  type WoundState,
} from './types';

export interface Target {
  id: string;
  compliance: number; // 0–100
  aggression: number; // 0–10
  wound: WoundState;
  /** already cuffed: no further force needed or useful */
  detained: boolean;
  /** stabilised targets become witnesses with a grudge (P2-T05) */
  stabilised: boolean;
}

export interface ForceAction {
  rung: ForceRung;
  tool: string;
  /** how many bystanders could see it */
  witnesses: number;
  /** area effects drift: gas and collective force hit bystanders */
  area: boolean;
}

export interface ForceOutcome {
  target: Target;
  /** bystanders driven *up* the aggression scale, and why */
  witnessesRoused: number;
  /** collateral: bystanders hurt by an area effect */
  collateral: number;
  /** 0–3, the report's damage field */
  damage: number;
  /** added to sector force_index */
  forceWeight: number;
  /** the log tag for the report: `control:hands`, `lethal:firearm`, ... */
  logTag: string | null;
  /** legitimacy delta for the debrief */
  legitimacy: number;
  /** true when this action requires a report line at all */
  needsLine: boolean;
  /**
   * Force applied to someone already down. Mechanically it is just another
   * application of rung 4+, but the record treats it differently: it is the one
   * thing the audit can prove about *intent* rather than outcome.
   */
  execution: boolean;
}

/** Compliance gained per second by a visible uniform at close range. */
export const PRESENCE_RATE = 8;

export function applyPresence(target: Target, seconds: number, uniformVisible: boolean): Target {
  if (!uniformVisible || target.detained) return target;
  return { ...target, compliance: Math.min(100, target.compliance + PRESENCE_RATE * seconds) };
}

/**
 * Apply a rung. Every rung 2+ returns `needsLine: true` — exactly one line, with
 * the correct tool tag. That is tested, not assumed.
 */
export function applyForce(
  target: Target,
  action: ForceAction,
  opts: { authorised: boolean },
): ForceOutcome {
  const { rung } = action;
  let next: Target = { ...target };
  let collateral = 0;
  let damage = 0;
  let witnessesRoused = 0;

  switch (rung) {
    case 1:
      next = applyPresence(next, 1, true);
      break;
    case 2:
      next.compliance = Math.min(100, next.compliance + 25);
      // repeated control makes people angrier
      next.aggression = Math.min(10, next.aggression + 1);
      break;
    case 3:
      next.compliance = Math.min(100, next.compliance + 60);
      next.aggression = Math.min(10, next.aggression + 3);
      damage = action.area ? 1 : 0;
      collateral = action.area ? 1 : 0;
      witnessesRoused = 2;
      break;
    case 4: {
      next.wound = next.wound === 'healthy' ? 'down' : bump(next.wound, 1);
      next.compliance = 100;
      witnessesRoused = action.witnesses;
      break;
    }
    case 5:
      next.wound = 'dead';
      next.compliance = 100;
      damage = 3;
      collateral = action.area ? 3 : 1;
      witnessesRoused = action.witnesses + 4;
      break;
  }

  if (witnessesRoused > 0 && rung >= 4) {
    // everyone who saw lethal force is angrier, including people not involved
    witnessesRoused = Math.max(witnessesRoused, action.witnesses);
  }

  const unauthorised = rung >= RUNG_NEEDS_AUTHORISATION && !opts.authorised;
  const execution = rung >= 4 && target.wound === 'down';

  return {
    target: next,
    witnessesRoused,
    collateral,
    damage,
    forceWeight: RUNG_WEIGHT[rung],
    logTag: RUNG_TOOL[rung] ? `${logName(rung)}:${action.tool}` : null,
    legitimacy: -legitimacyCost(rung) - (unauthorised ? 2 : 0),
    needsLine: rung >= 2,
    execution,
  };
}

function logName(rung: ForceRung): string {
  switch (rung) {
    case 2:
      return 'control';
    case 3:
      return 'compliance';
    case 4:
      return 'lethal';
    default:
      return 'collective';
  }
}

/** Legitimacy cost per rung, in the same units as the inspection table. */
export function legitimacyCost(rung: ForceRung): number {
  return { 1: 0, 2: 0.5, 3: 1.5, 4: 3, 5: 5 }[rung];
}

function bump(wound: WoundState, steps: number): WoundState {
  const order: WoundState[] = ['healthy', 'winded', 'wounded', 'down', 'dead'];
  const i = order.indexOf(wound);
  return order[Math.min(order.length - 1, i + steps)]!;
}

/* ---------------------------------------------------------- authorisation */

export interface Authorisation {
  rung: ForceRung;
  requestedAt: number;
  /** sim-seconds; the radio call takes 4 */
  grantedAt: number | null;
  denied: boolean;
  /** who answered, for the log */
  by: string;
}

export const AUTHORISATION_CALL_SECONDS = 4;

/**
 * Request authorisation. In Act III this is granted too easily — that is the
 * design's horror, not a bug — so the *granted* branch is the default here and
 * the difficulty lives in the incident, not in this function.
 */
export function requestAuthorisation(
  rung: ForceRung,
  atSimSeconds: number,
  opts: { alwaysDeny?: boolean } = {},
): Authorisation {
  const denied = opts.alwaysDeny === true;
  return {
    rung,
    requestedAt: atSimSeconds,
    grantedAt: denied ? null : atSimSeconds + AUTHORISATION_CALL_SECONDS,
    denied,
    by: denied ? 'sector control' : 'duty officer',
  };
}

export function isAuthorised(
  auth: Authorisation | null,
  rung: ForceRung,
  atSimSeconds: number,
): boolean {
  if (rung < RUNG_NEEDS_AUTHORISATION) return true;
  if (!auth) return false;
  if (auth.denied) return false;
  return auth.rung >= rung && auth.grantedAt !== null && atSimSeconds >= auth.grantedAt;
}

export function rungLabel(rung: ForceRung): string {
  return RUNG_LABEL[rung];
}

/* --------------------------------------------------------------- ratchet */

export interface ForceIndex {
  sector: string;
  value: number;
}

export const FORCE_DECAY_PER_SHIFT = 0.15;

/**
 * The ratchet that makes the brief's feedback loop literally true: three
 * aggressive shifts raise what you meet next week, three restrained shifts lower
 * it. Decay is per shift, not per action, so a single bad night is survivable.
 */
export function decayForceIndex(index: ForceIndex): ForceIndex {
  return { ...index, value: Math.round(index.value * (1 - FORCE_DECAY_PER_SHIFT) * 100) / 100 };
}

export function addForce(index: ForceIndex, weight: number): ForceIndex {
  return { ...index, value: Math.round((index.value + weight) * 100) / 100 };
}

/** Where the index puts tonight's starting temperature, 0–1. */
export function pressureFromIndex(index: ForceIndex): number {
  // 20 is "three rough shifts in a row"; beyond that it saturates
  return Math.min(1, index.value / 20);
}

/** Incidents start one rung higher when the sector is hot. */
export function startingRung(index: ForceIndex): ForceRung {
  const p = pressureFromIndex(index);
  if (p > 0.75) return 3 as ForceRung;
  if (p > 0.4) return 2 as ForceRung;
  return 1 as ForceRung;
}

/** Hostile compliance and aggression at scene start, from the same pressure. */
export function startingMood(index: ForceIndex): { compliance: number; aggression: number } {
  const p = pressureFromIndex(index);
  return {
    compliance: Math.round(55 - p * 35),
    aggression: Math.round(1 + p * 6),
  };
}
