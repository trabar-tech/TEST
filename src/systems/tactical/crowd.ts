/**
 * Crowds as a mood graph (SYS-TACT-01 §6, P2-T07).
 *
 * A crowd is not forty ragdolls. It is one number with hysteresis plus a state
 * machine, because the player needs to *read intent* at a glance and the machine
 * needs to stay inside the 125 µs tick budget. What the crowd does is react to
 * the same eight verbs as everything else — which is the point: the tactical
 * layer has one vocabulary, and brutality in it is legible.
 */

export type CrowdState = 'milling' | 'chanting' | 'surging' | 'scattering' | 'riot' | 'dispersing';

export interface CrowdDef {
  id: string;
  label: string;
  agents: number;
  heat: number;
  leaders: string[];
  grievance: string;
  state: CrowdState;
}

export interface CrowdAction {
  kind:
    | 'presence'
    | 'single_voice'
    | 'arrest_leader'
    | 'baton_charge'
    | 'gas'
    | 'loudhailer'
    | 'withdraw'
    | 'idle';
  /** sim-seconds the action has been sustained (presence/withdraw are rates) */
  seconds?: number;
}

export interface CrowdOutcome {
  crowd: CrowdDef;
  /** true when the state changed this action */
  transitioned: boolean;
  /** arrests change grievance, and grievance outlives the shift */
  grievance: string;
  legitimacy: number;
  standing: number;
  note: string;
}

/** Transitions are driven by heat, with thresholds, not by velocity. */
export const HEAT_THRESHOLDS = {
  /** below this, milling loses to chanting */
  chant: 0.35,
  /** above this, chanting becomes surging */
  surge: 0.6,
  /** above this, surveillance becomes panic */
  riot: 0.85,
} as const;

export function stepCrowd(crowd: CrowdDef, action: CrowdAction): CrowdOutcome {
  let heat = crowd.heat;
  let state = crowd.state;
  let legitimacy = 0;
  let standing = 0;
  let note = '';

  switch (action.kind) {
    case 'presence':
    case 'single_voice': {
      const secs = action.seconds ?? 1;
      heat -= (action.kind === 'single_voice' ? 0.05 : 0.03) * secs;
      if (state === 'chanting' || state === 'milling') state = 'milling';
      legitimacy += 0.05 * secs;
      note = 'They settle a little. One voice at a time is the only thing that works.';
      break;
    }
    case 'loudhailer': {
      if (crowd.heat < 0.5) {
        heat -= 0.3;
        state = 'dispersing';
        note = 'The loudhailer lands. They drift apart rather than scatter.';
      } else {
        heat += 0.05;
        note = 'Too hot for the loudhailer. It is just noise to them now.';
      }
      break;
    }
    case 'arrest_leader': {
      heat += 0.35;
      state = heat > HEAT_THRESHOLDS.surge ? 'surging' : 'chanting';
      legitimacy -= 1;
      note = 'The leader goes down into the car. The street does not forget which face did it.';
      break;
    }
    case 'baton_charge': {
      heat += 0.2;
      state = 'scattering';
      standing -= 1;
      legitimacy -= 1.5;
      note = 'They scatter. The grievance does not.';
      break;
    }
    case 'gas': {
      heat += 0.5;
      state = 'riot';
      standing -= 2;
      legitimacy -= 3;
      note = 'Panic, then scatter. Someone will be carried out of this.';
      break;
    }
    case 'withdraw': {
      heat -= 0.1 * (action.seconds ?? 1);
      state = 'milling';
      standing -= 0.5;
      legitimacy += 0.5;
      note = 'They keep the street. That is a loss the Directorate will notice.';
      break;
    }
    case 'idle': {
      // heat decays slowly on its own; a crowd left alone cools
      heat -= 0.01 * (action.seconds ?? 1);
      break;
    }
  }

  // clamp, then re-derive the state from heat unless an action overrode it
  heat = Math.max(0, Math.min(1, heat));
  if (action.kind === 'idle') {
    state =
      heat > HEAT_THRESHOLDS.riot
        ? 'riot'
        : heat > HEAT_THRESHOLDS.surge
          ? 'surging'
          : heat > HEAT_THRESHOLDS.chant
            ? 'chanting'
            : 'milling';
  }

  return {
    crowd: { ...crowd, heat, state },
    transitioned: state !== crowd.state,
    grievance: crowd.grievance,
    legitimacy,
    standing,
    note,
  };
}

/** Readability: the ring on the ground, blue to red. Never a number. */
export function heatBand(heat: number): 'calm' | 'warm' | 'hot' | 'critical' {
  if (heat > HEAT_THRESHOLDS.riot) return 'critical';
  if (heat > HEAT_THRESHOLDS.surge) return 'hot';
  if (heat > HEAT_THRESHOLDS.chant) return 'warm';
  return 'calm';
}

/** The crowd's version of "clear is a claim": dispersal is not compliance. */
export function dispersalOutcome(crowd: CrowdDef, arrests: number): {
  lowStanding: boolean;
  highLegitimacy: boolean;
  directorateQuestion: string;
} {
  const dispersed = crowd.state === 'dispersing' || crowd.state === 'milling';
  return {
    lowStanding: dispersed && arrests === 0,
    highLegitimacy: dispersed,
    directorateQuestion:
      arrests === 0
        ? 'Why were there no detentions at all? The Directorate will want a line explaining that.'
        : 'Four detentions and no dispersal. Explain the escalation.',
  };
}
