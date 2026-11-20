/**
 * P3-T02 acceptance — "the person you arrested on Monday appears on Tuesday".
 *
 * The cap is only worth anything if the twelve *return*. These tests check the three
 * properties a player would notice: known faces come back, the reason is nameable, and
 * the choice is the same on a reload.
 */

import { describe, expect, it } from 'vitest';
import { chooseRecurrence, lineFor, rankRecurrence } from '@systems/recurrence';
import { generateSector, type SectorState } from '@systems/households';

const sector = (over: Partial<SectorState> = {}): SectorState => ({
  id: 'kiln_row',
  shift: 3,
  households: [
    { id: 'h-001', block: 'tenement_row', members: 3, ration_class: 'C', housing: 'secure', loyalty: 0.5, secret: null, flags: [], grievance: 0.2 },
    { id: 'h-002', block: 'canal_market', members: 2, ration_class: 'D', housing: 'crowded', loyalty: 0.3, secret: null, flags: [], grievance: 0.8 },
    { id: 'h-003', block: 'laundry_yard', members: 1, ration_class: 'A', housing: 'requisitioned', loyalty: 0.9, secret: null, flags: ['informant'], grievance: 0.05 },
  ],
  force_index: 0,
  supply_deficit: 0,
  faction_heat: 0,
  ...over,
});

const opts = (over: Record<string, unknown> = {}) => ({
  sector: sector(),
  known: [],
  shift: 3,
  seed: 2026,
  ...over,
});

describe('who comes back', () => {
  it('prefers a household the player can name', () => {
    const ranked = rankRecurrence(opts({ known: [{ household_id: 'h-001', reason: 'filed' }] }));
    const known = ranked.find((c) => c.household.id === 'h-001')!;
    const unknown = ranked.find((c) => c.household.id === 'h-003')!;
    expect(known.weight).toBeGreaterThan(unknown.weight);
    expect(known.why).toMatch(/put a name to them/);
  });

  it('prefers a household the Cell has recruited from', () => {
    const s = sector({
      households: sector().households.map((h) =>
        h.id === 'h-003' ? { ...h, flags: ['available'] } : h,
      ),
    });
    const ranked = rankRecurrence(opts({ sector: s }));
    expect(ranked.find((c) => c.household.id === 'h-003')!.why).toMatch(/Cell has been to their door/);
  });

  it('prefers a household with a live grudge, and says what it is about', () => {
    const ranked = rankRecurrence(
      opts({
        grudges: [
          {
            citizenId: 'h-002',
            causeLineId: 'arrest_of_recruit',
            intensity: 0.6,
            decayRule: 'per_shift' as const,
            satisfyingActions: [],
          },
        ],
      }),
    );
    expect(ranked.find((c) => c.household.id === 'h-002')!.why).toMatch(/arrest of recruit/);
  });

  it('always draws a Known household when there is one, because that is the point', () => {
    const known = [{ household_id: 'h-003', reason: 'filed' }];
    for (let shift = 1; shift <= 40; shift++) {
      const choice = chooseRecurrence(opts({ known, shift }));
      expect(choice!.household_id).toBe('h-003');
      expect(choice!.known).toBe(true);
    }
  });

  it('falls back to the district\'s own news when nobody is Known yet', () => {
    const choice = chooseRecurrence(opts({ known: [] }));
    expect(choice).not.toBeNull();
    expect(choice!.known).toBe(false);
  });

  it('can be told not to prefer the Known, for a Warden who wants the wider world', () => {
    const known = [{ household_id: 'h-003', reason: 'filed' }];
    const seen = new Set<string>();
    for (let shift = 1; shift <= 40; shift++) {
      seen.add(chooseRecurrence(opts({ known, shift, preferKnown: false }))!.household_id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is never silent about why, even for an unremarkable household', () => {
    const choice = chooseRecurrence(opts({ known: [] }))!;
    expect(choice.why.length).toBeGreaterThan(10);
    expect(choice.why).not.toMatch(/undefined/);
  });
});

describe('determinism, because a city that reshuffles is not a memory', () => {
  it('the same seed, shift and state give the same household', () => {
    const known = [{ household_id: 'h-002', reason: 'filed' }];
    const a = chooseRecurrence(opts({ known, shift: 5 }));
    const b = chooseRecurrence(opts({ known, shift: 5 }));
    expect(a).toEqual(b);
  });

  it('different shifts draw differently when nothing forces the Known', () => {
    const seen = new Set<string>();
    for (let shift = 1; shift <= 30; shift++) {
      seen.add(chooseRecurrence(opts({ shift, preferKnown: false }))!.household_id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('an empty district returns nothing rather than throwing', () => {
    expect(chooseRecurrence(opts({ sector: sector({ households: [] }) }))).toBeNull();
  });

  it('works on a real generated district, not just fixtures', () => {
    const real = generateSector({ seed: 7 });
    const choice = chooseRecurrence({ sector: real, known: [], shift: 2, seed: 7 });
    expect(real.households.map((h) => h.id)).toContain(choice!.household_id);
  });
});

describe('a line is a story, not a status', () => {
  it('says what happened, in the block\'s own name', () => {
    const line = lineFor(sector().households[1]!);
    expect(line).toMatch(/canal market/);
    expect(line).not.toMatch(/_/);
    expect(line.endsWith('.')).toBe(true);
  });

  it('distinguishes a recruited household from a merely angry one', () => {
    const recruited = lineFor({ ...sector().households[1]!, flags: ['available'] });
    const angry = lineFor(sector().households[1]!);
    expect(recruited).not.toBe(angry);
    expect(recruited).toMatch(/which way the patrols/);
  });

  it('reads an informant as watching, not as friendly', () => {
    expect(lineFor(sector().households[2]!)).toMatch(/watching the corner/);
  });

  it('never returns an empty string for any household the sim can generate', () => {
    const real = generateSector({ seed: 3 });
    for (const household of real.households) {
      expect(lineFor(household).length).toBeGreaterThan(15);
    }
  });
});
