/**
 * The Cell's plan engine — HTN-lite (SYS-DIR-01 §7, P3-T07).
 *
 * The insurgency has to feel *purposive* rather than random, and the cheapest way
 * to buy that is three authored shifts of intent: procure, recruit, strike. It is
 * not a planner and must not become one — a real HTN solver would generate
 * operations no writer can review, and the point of the plan is that the player
 * can *read* it.
 *
 * Which brings the load-bearing feature: **informants turn the director into a
 * puzzle instead of a slot machine.** With enough coverage, `readPlan()` tells the
 * player what the Cell is about to do. That is the entire "surveillance pays off"
 * loop, and it only works if plans are deterministic and legible.
 *
 * ## The legal boundary (research R-6, non-negotiable)
 *
 * A grudge is a **record with a cause**: citizen, cause line, intensity, decay,
 * and the actions that satisfy it. It changes disposition, dialogue and the odds of
 * that person appearing. It **never** promotes anyone into a scarred returning
 * nemesis, and there is no enemy hierarchy that ranks people by encounters with the
 * player. If a change here starts looking like the Nemesis system, stop.
 */

import type { Rng } from '@core/rng';

export type PlanStep = 'procure' | 'recruit' | 'strike';
export const PLAN_STEPS: readonly PlanStep[] = ['procure', 'recruit', 'strike'];

export type FactionId = 'cell' | 'syndicate' | 'congregation';

export interface PlanDef {
  id: string;
  faction: FactionId;
  /** the incident card the strike produces */
  produces: string;
  /** which household trait recruitment needs */
  recruitNeeds?: { grievanceAtLeast: number };
  /** which kind of site procurement needs */
  needsSite?: 'safehouse' | 'route' | 'chapel';
}

export interface PlanWorld {
  households: ReadonlyArray<{ id: string; grievance: number; flags: readonly string[] }>;
  /** sites the player has burned or cleared; procurement fails against these */
  deniedSites?: readonly string[];
  safehouses?: readonly string[];
  routes?: readonly string[];
  chapels?: readonly string[];
  arrestsThisShift?: number;
  confiscationsThisShift?: number;
  curfewEnforced?: boolean;
}

export interface PlanInstance {
  def: PlanDef;
  startedShift: number;
  step: number;
  status: 'running' | 'completed' | 'failed';
  /** the household the Cell recruited, so an arrest has a name attached */
  recruitId?: string;
  siteId?: string;
  /** how many times it has reset; antagonism rises with each */
  resets: number;
  log: string[];
}

/** A grudge is a record with a cause — see the boundary note above. */
export interface Grudge {
  citizenId: string;
  causeLineId: string;
  /** 0–1 */
  intensity: number;
  decayRule: 'per_shift' | 'never' | 'satisfied';
  /** the authored actions that settle it */
  satisfyingActions: string[];
}

export function startPlan(def: PlanDef, world: PlanWorld, shift: number): PlanInstance {
  return { def, startedShift: shift, step: 0, status: 'running', resets: 0, log: [] };
}

export interface PlanTick {
  instance: PlanInstance;
  /** one line for the shift report's "what the district did" block */
  report: string[];
  /** the incident card to dispatch, if the strike lands */
  produces?: string;
  /** antagonism delta for the faction */
  antagonism: number;
  grudge?: Grudge;
}

/**
 * Advance one shift. The Cell's steps can *fail* in ways the player caused, and
 * that failure is the interesting part: burning the safehouse spends the Cell's
 * shift, raises antagonism, and buys a grudge with a name on it.
 */
export function advancePlan(inst: PlanInstance, world: PlanWorld, shift: number, rng: Rng): PlanTick {
  if (inst.status !== 'running') return { instance: inst, report: [], antagonism: 0 };

  const instance: PlanInstance = { ...inst, log: [...inst.log] };
  const report: string[] = [];
  const step = PLAN_STEPS[instance.step]!;

  if (step === 'procure') {
    const pool =
      instance.def.needsSite === 'safehouse' ? (world.safehouses ?? [])
      : instance.def.needsSite === 'route' ? (world.routes ?? [])
      : instance.def.needsSite === 'chapel' ? (world.chapels ?? [])
      : [];
    const denied = new Set(world.deniedSites ?? []);
    const usable = pool.filter((s) => !denied.has(s));

    if (usable.length === 0) {
      instance.step = 0;
      instance.resets += 1;
      instance.status = instance.resets >= 2 ? 'failed' : 'running';
      report.push(
        instance.status === 'failed'
          ? `${instance.def.faction} stops trying to establish itself`
          : `${instance.def.faction} cannot find room for ${instance.def.needsSite ?? 'a base'} and starts again`,
      );
      return { instance, report, antagonism: 1 };
    }

    instance.siteId = rng.pick(usable)!;
    instance.step = 1;
    instance.log.push(`procured ${instance.siteId}`);
    report.push(`${instance.def.faction} is using ${instance.siteId}`);
    return { instance, report, antagonism: 0 };
  }

  if (step === 'recruit') {
    const threshold = instance.def.recruitNeeds?.grievanceAtLeast ?? 0.6;
    const candidates = world.households.filter((h) => h.grievance >= threshold && !h.flags.includes('informant'));
    const arrested = world.arrestsThisShift ?? 0;

    if (candidates.length === 0 || arrested > 0) {
      // the player arrested someone this shift — sometimes they arrested the recruit
      const victim = candidates.length > 0 ? rng.pick(candidates)! : undefined;
      instance.step = 0;
      instance.resets += 1;
      if (victim && arrested > 0) {
        report.push(`${instance.def.faction} loses a recruit: ${victim.id} was taken in`);
        return {
          instance,
          report,
          antagonism: 1,
          grudge: {
            citizenId: victim.id,
            causeLineId: 'arrest_of_recruit',
            intensity: 0.6,
            decayRule: 'per_shift',
            satisfyingActions: ['release_from_detention', 'drop_the_line'],
          },
        };
      }
      report.push(`${instance.def.faction} finds nobody willing to join`);
      return { instance, report, antagonism: 1 };
    }

    const recruit = rng.pick(candidates)!;
    instance.recruitId = recruit.id;
    instance.step = 2;
    instance.log.push(`recruited ${recruit.id}`);
    report.push(`${instance.def.faction} has recruited someone in ${recruit.id}`);
    return { instance, report, antagonism: 0 };
  }

  // strike
  const interrupted = (world.confiscationsThisShift ?? 0) >= 2 || world.curfewEnforced === true;
  if (interrupted) {
    instance.step = 0;
    instance.resets += 1;
    instance.status = instance.resets >= 2 ? 'failed' : 'running';
    report.push(`${instance.def.faction} pulls back from its strike — the streets were watched`);
    return {
      instance,
      report,
      antagonism: 1,
      grudge: instance.recruitId
        ? {
            citizenId: instance.recruitId,
            causeLineId: 'plan_interrupted',
            intensity: 0.4,
            decayRule: 'per_shift',
            satisfyingActions: ['leave_them_alone_for_two_shifts'],
          }
        : undefined,
    };
  }

  instance.status = 'completed';
  instance.step = 3;
  report.push(`${instance.def.faction} strikes: ${instance.def.produces}`);
  return { instance, report, antagonism: 2, produces: instance.def.produces };
}

/**
 * What an informant network buys. `coverage` is 0–1; above 0.4 the player learns
 * the next step, above 0.7 they learn the site *and* the recruit.
 *
 * Deliberately not probabilistic at the point of reading: an informant report that
 * sometimes lies is indistinguishable from a bug, and the whole point is that the
 * player can plan against it.
 */
export function readPlan(inst: PlanInstance, coverage: number): string | null {
  if (inst.status !== 'running' || coverage < 0.4) return null;
  const step = PLAN_STEPS[inst.step] ?? 'procure';
  if (coverage >= 0.7) {
    if (step === 'procure') return `they are looking for a ${inst.def.needsSite ?? 'site'}`;
    if (step === 'recruit') return `they are recruiting from the households with the most complaints`;
    return `they intend to strike at ${inst.siteId ?? 'an unnamed site'}`;
  }
  return `they are at the "${step}" stage`;
}

/** Session-visible summary, for the briefing screen. */
export function describePlan(inst: PlanInstance): string {
  const step = PLAN_STEPS[inst.step] ?? 'done';
  return `${inst.def.faction}: ${inst.status} at ${step}${inst.resets > 0 ? ` (${inst.resets} reset)` : ''}`;
}

/** Grudges decay; a grudge that decays to nothing is simply forgotten, not avenged. */
export function decayGrudges(grudges: readonly Grudge[], shift: number): Grudge[] {
  void shift;
  return grudges
    .map((g) => ({
      ...g,
      intensity: g.decayRule === 'never' ? g.intensity : Math.max(0, g.intensity - 0.1),
    }))
    .filter((g) => g.intensity > 0);
}
