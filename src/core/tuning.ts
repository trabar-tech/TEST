/**
 * The single tuning surface (Phase 4 entry criterion).
 *
 * > All tuning parameters exposed in JSON with a single `tuning.json` for the campaign curve
 *
 * A number that lives in a module is a number nobody compares. The point of this file is not
 * ceremony — it is that `npm run campaign` can be run before and after a *one-line edit to
 * JSON*, which turns tuning from an argument into a measurement.
 *
 * The rules:
 *
 * 1. **This module is the only place allowed to hold a default.** Systems read tuned values
 *    from the resolved object; they do not carry their own copies, because two copies of a
 *    constant is how the bill and the wage ended up disagreeing in `SYS-ECON-01`.
 * 2. **Missing values fall back to the shipped JSON, not to inline literals.** A partial
 *    override (a test, a mod, a what-if) changes one number and nothing else.
 * 3. **The resolved object is frozen.** A system that mutates tuning mid-shift makes every
 *    report written afterwards untrustworthy.
 */

import tuningJson from '../../content/tuning.json';

export interface Tuning {
  version: number;
  economy: {
    rent: number;
    food: number;
    medicine: number;
    debt_floor: number;
    max_lines: number;
    wage_base: number;
    wage_per_rank: number;
    wage_cap: number;
    promotion_thresholds: number[];
  };
  district: {
    turn_shifts: number;
    neighbour_share: number;
    available_threshold: number;
    informant_threshold: number;
    max_force: number;
    temperature_weights: { legitimacy: number; force: number; supply: number; faction: number };
  };
  recurrence: {
    known_weight: number;
    available_weight: number;
    grudge_weight: number;
    recent_penalty: number;
    prefer_known: boolean;
    known_cap: number;
  };
  storylets: {
    cards_first_shift: number;
    cards_per_shift: number;
    novelty_window: number;
    release_pressure_ceiling: number;
  };
  scenes: {
    air_between_cards_ms: number;
    delay_before_first_ms: number;
    legitimacy_to_grievance: number;
  };
}

/** A partial tuning document: any subset of any block. */
export type TuningPatch = {
  [K in keyof Tuning]?: Tuning[K] extends object
    ? Partial<Tuning[K]>
    : Tuning[K];
};

/** Deep-merge a patch onto a base document, one level into each block. */
export function mergeTuning(base: Tuning, patch: TuningPatch): Tuning {
  // worked as a plain record: a keyed union of block types makes every assignment an
  // intersection of all five blocks. One cast at the end is cheaper to read than five.
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const current = out[key];
    if (typeof value === 'object' && value !== null && typeof current === 'object' && current !== null) {
      // one level is all this shape needs; nested weights are replaced wholesale
      out[key] = { ...(current as object), ...(value as object) };
    } else {
      out[key] = value;
    }
  }
  return deepFreeze(out as unknown as Tuning);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate a tuning document loudly.
 *
 * A tuning file that is silently wrong is worse than none: it produces a curve nobody can
 * explain. These are the invariants that make a run interpretable rather than the ones that
 * make it "balanced" — balance is the campaign runner's job, not a schema's.
 */
export function checkTuning(t: Tuning): string[] {
  const problems: string[] = [];
  if (t.economy.max_lines < 1 || t.economy.max_lines > 6) {
    problems.push(`economy.max_lines ${t.economy.max_lines} is outside 1–6`);
  }
  if (t.economy.debt_floor >= 0) problems.push('economy.debt_floor must be negative');
  if (t.economy.promotion_thresholds.length !== 5) {
    problems.push(`economy.promotion_thresholds needs 5 tiers, has ${t.economy.promotion_thresholds.length}`);
  }
  if (t.district.turn_shifts < 1) problems.push('district.turn_shifts must be at least 1');
  if (t.district.neighbour_share < 0 || t.district.neighbour_share > 1) {
    problems.push('district.neighbour_share must be 0–1');
  }
  if (t.storylets.cards_per_shift < 0) problems.push('storylets.cards_per_shift must be >= 0');
  if (t.storylets.release_pressure_ceiling <= 0 || t.storylets.release_pressure_ceiling > 1) {
    problems.push('storylets.release_pressure_ceiling must be 0–1');
  }
  const w = t.district.temperature_weights;
  const sum = w.legitimacy + w.force + w.supply + w.faction;
  if (Math.abs(sum - 1) > 0.001) problems.push(`district.temperature_weights sum to ${sum.toFixed(3)}, not 1`);
  return problems;
}

/**
 * Read tuning from a JSON document, failing loudly with the field names.
 *
 * Deliberately not a schema library: the shape is small, the error messages matter more than
 * the validation coverage, and a tuning file should never be the reason a build needs a new
 * dependency.
 */
export function resolveTuning(raw: unknown): Tuning {
  if (typeof raw !== 'object' || raw === null) throw new Error('tuning.json: not an object');
  const r = raw as Record<string, unknown>;
  const missing = (['economy', 'district', 'recurrence', 'storylets', 'scenes'] as const).filter(
    (k) => typeof r[k] !== 'object' || r[k] === null,
  );
  if (missing.length) throw new Error(`tuning.json: missing block(s) ${missing.join(', ')}`);
  const resolved = deepFreeze(r) as unknown as Tuning;
  const problems = checkTuning(resolved);
  if (problems.length) throw new Error(`tuning.json:\n  ${problems.join('\n  ')}`);
  return resolved;
}

/**
 * The shipped tuning document, resolved once at module load.
 *
 * Imported by systems rather than passed down a long call chain: a `Tuning` argument on every
 * function would be honest but would bury the one thing this file exists to make visible. The
 * explicit `t` parameter on each function exists for tests and what-ifs; production reads this.
 */
export let TUNING: Tuning = resolveTuning(tuningJson);

/**
 * Replace the live document. **Tooling only** — `npm run sweep`, the campaign runner's
 * what-ifs, and tests.
 *
 * The first version of the sweep created a patched document, printed a header, and never
 * passed it anywhere: twelve runs of three different values produced one identical row. A
 * tuning tool that silently does nothing is worse than no tool, because it produces
 * confidence. This function exists so a patch cannot be "applied" without being applied;
 * anything derived at import time (`turnShifts()`, `maxLedgerLines()`) reads through it.
 */
export function tune(patch: TuningPatch): Tuning {
  TUNING = mergeTuning(TUNING, patch);
  return TUNING;
}

/** Restore the shipped document (tests, and the end of a sweep). */
export function resetTuning(): Tuning {
  TUNING = resolveTuning(tuningJson);
  return TUNING;
}
