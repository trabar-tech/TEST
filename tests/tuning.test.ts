/**
 * The single tuning surface (Phase 4 entry criterion).
 *
 * These tests are about *legibility*, not balance: a tuning file that loads but is silently
 * wrong produces a curve nobody can explain, which is worse than no tuning file at all.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TUNING, checkTuning, mergeTuning, resolveTuning } from '@core/tuning';

const shipped = () => JSON.parse(readFileSync(join(process.cwd(), 'content/tuning.json'), 'utf8'));

describe('the shipped tuning document', () => {
  it('loads, validates and is frozen', () => {
    expect(TUNING.version).toBe(1);
    expect(Object.isFrozen(TUNING)).toBe(true);
    expect(Object.isFrozen(TUNING.economy)).toBe(true);
  });

  it('is the only place a balance number lives', () => {
    // the spec's own numbers, so a drift is visible in the diff rather than in the game
    expect(TUNING.economy.rent).toBe(30);
    expect(TUNING.economy.food).toBe(22);
    expect(TUNING.economy.medicine).toBe(15);
    expect(TUNING.economy.debt_floor).toBe(-60);
    expect(TUNING.district.turn_shifts).toBe(3);
  });

  it('flags its own unreconciled economy rather than looking finished', () => {
    expect(String(tuningNote())).toMatch(/un-reconciled/);
  });
});

function tuningNote(): string {
  return (shipped() as { _status?: string })._status ?? '';
}

describe('overrides change one number and nothing else', () => {
  it('a partial patch leaves everything else at the shipped value', () => {
    const patched = mergeTuning(TUNING, { economy: { rent: 12 } } as never);
    expect(patched.economy.rent).toBe(12);
    expect(patched.economy.food).toBe(TUNING.economy.food);
    expect(patched.district.turn_shifts).toBe(TUNING.district.turn_shifts);
  });

  it('a scalar patch works (version), and does not disturb blocks', () => {
    const patched = mergeTuning(TUNING, { version: 2 });
    expect(patched.version).toBe(2);
    expect(patched.economy).toEqual(TUNING.economy);
  });

  it('does not mutate the base document', () => {
    const before = TUNING.economy.rent;
    mergeTuning(TUNING, { economy: { rent: 1 } } as never);
    expect(TUNING.economy.rent).toBe(before);
  });

  it('the result is frozen too, so a system cannot tune itself mid-shift', () => {
    const patched = mergeTuning(TUNING, { economy: { rent: 1 } } as never);
    expect(Object.isFrozen(patched)).toBe(true);
  });
});

describe('a wrongly shaped document fails loudly, with the field named', () => {
  it('refuses a missing block and says which', () => {
    const raw = shipped();
    delete raw.scenes;
    expect(() => resolveTuning(raw)).toThrow(/missing block\(s\) scenes/);
  });

  it('refuses temperature weights that do not sum to 1', () => {
    const raw = shipped();
    raw.district.temperature_weights.faction = 0.5;
    expect(() => resolveTuning(raw)).toThrow(/temperature_weights sum to/);
  });

  it('refuses a debt floor that is not a debt', () => {
    const raw = shipped();
    raw.economy.debt_floor = 0;
    expect(() => resolveTuning(raw)).toThrow(/debt_floor must be negative/);
  });

  it('refuses the wrong number of promotion tiers', () => {
    const raw = shipped();
    raw.economy.promotion_thresholds = [10, 20];
    expect(() => resolveTuning(raw)).toThrow(/needs 5 tiers/);
  });

  it('checkTuning reports every problem rather than the first', () => {
    const broken = {
      ...TUNING,
      economy: { ...TUNING.economy, debt_floor: 5, promotion_thresholds: [] },
      district: { ...TUNING.district, neighbour_share: 2 },
    };
    expect(checkTuning(broken).length).toBeGreaterThanOrEqual(3);
  });
});
