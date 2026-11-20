/**
 * P3-T01 (the half that was missing) — the district reacts.
 *
 * The street→district binding lets the player learn where people live. This is the
 * other direction, and it is where "the city remembers" stops being a claim. The three
 * properties that matter are all fairness properties, so they are what is tested:
 * only claims count, neighbours feel it, and it does not wash off.
 */

import { describe, expect, it } from 'vitest';
import { NEIGHBOUR_SHARE, REACTIONS, harden, reactToFilings } from '@systems/household-reaction';
import { generateSector, legitimacy, temperature, type SectorState } from '@systems/households';

const sector = (over: Partial<SectorState> = {}): SectorState => ({
  id: 'kiln_row',
  shift: 1,
  households: [
    { id: 'h-001', block: 'tenement_row', members: 3, ration_class: 'C', housing: 'secure', loyalty: 0.5, secret: null, flags: [], grievance: 0.3 },
    { id: 'h-002', block: 'tenement_row', members: 2, ration_class: 'D', housing: 'crowded', loyalty: 0.4, secret: null, flags: [], grievance: 0.3 },
    { id: 'h-003', block: 'canal_market', members: 1, ration_class: 'B', housing: 'secure', loyalty: 0.8, secret: null, flags: [], grievance: 0.2 },
  ],
  force_index: 0,
  supply_deficit: 0,
  faction_heat: 0,
  ...over,
});

const grievanceOf = (s: SectorState, id: string) => s.households.find((h) => h.id === id)!.grievance;

describe('only what was filed counts', () => {
  it('a detention raises the household it happened in', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D' }] });
    expect(grievanceOf(out.sector, 'h-001')).toBeCloseTo(0.3 + REACTIONS.D, 3);
  });

  it('does nothing at all to a household that was not named', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D' }] });
    expect(grievanceOf(out.sector, 'h-003')).toBe(0.2);
  });

  it('a clear is the one thing that helps', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'C' }] });
    expect(grievanceOf(out.sector, 'h-001')).toBeLessThan(0.3);
  });

  it('filing nothing still moves the needle, because walking away is noticed', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: '-' }] });
    expect(grievanceOf(out.sector, 'h-001')).toBeGreaterThan(0.3);
  });

  it('lethal force makes the line heavier than the classification alone', () => {
    const soft = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D' }] });
    const hard = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D', force_rung: 4 }] });
    expect(grievanceOf(hard.sector, 'h-001')).toBeGreaterThan(grievanceOf(soft.sector, 'h-001'));
  });
});

describe('the neighbours feel it', () => {
  it('same block, a third of the effect', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D' }] });
    const delta = grievanceOf(out.sector, 'h-002') - 0.3;
    expect(delta).toBeCloseTo(REACTIONS.D * NEIGHBOUR_SHARE, 3);
  });

  it('a different block feels nothing', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D' }] });
    expect(grievanceOf(out.sector, 'h-003')).toBeCloseTo(0.2, 5);
  });

  it('names every household that moved, so the debrief can say so', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D' }] });
    expect(out.changed.map((c) => c.household_id).sort()).toEqual(['h-001', 'h-002']);
  });

  it('speaks in a sentence a briefer could say, not a percentage', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'D' }] });
    expect(out.summary).toMatch(/tenement row is angry/);
    expect(out.summary).not.toMatch(/%|\d/);
  });

  it('says so plainly when a shift changed nothing good', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-001', classification: 'C' }] });
    expect(out.summary).toMatch(/easier tonight/);
  });

  it('has something to say even about a shift nobody reacted to', () => {
    const out = reactToFilings({ sector: sector(), acts: [] });
    expect(out.changed).toEqual([]);
    expect(out.summary).toMatch(/took no notice/);
  });
});

describe('it does not wash off', () => {
  it('is order-independent: the same three lines make the same district', () => {
    const acts = [
      { household_id: 'h-001', classification: 'D' as const },
      { household_id: 'h-002', classification: 'R' as const },
      { household_id: 'h-001', classification: 'D' as const },
    ];
    const a = reactToFilings({ sector: sector(), acts });
    const b = reactToFilings({ sector: sector(), acts: [...acts].reverse() });
    expect(a.sector.households).toEqual(b.sector.households);
  });

  it('accumulates: three bad nights beat one, and never exceed 1', () => {
    let s = sector();
    for (let i = 0; i < 6; i++) {
      s = reactToFilings({ sector: s, acts: [{ household_id: 'h-001', classification: 'D' }] }).sector;
    }
    expect(grievanceOf(s, 'h-001')).toBe(1);
  });

  it('never goes below 0, however kind the Warden is', () => {
    let s = sector();
    for (let i = 0; i < 20; i++) {
      s = reactToFilings({ sector: s, acts: [{ household_id: 'h-001', classification: 'C' }] }).sector;
    }
    expect(grievanceOf(s, 'h-001')).toBeGreaterThanOrEqual(0);
  });

  it('feeds legitimacy and temperature, so the street gets worse in the open', () => {
    const before = sector();
    const after = reactToFilings({
      sector: before,
      acts: [
        { household_id: 'h-001', classification: 'D', force_rung: 4 },
        { household_id: 'h-002', classification: 'D' },
      ],
    }).sector;
    expect(legitimacy(after)).toBeLessThan(legitimacy(before));
    expect(temperature(after)).toBeGreaterThan(temperature(before));
  });

  it('ignores an act naming a household that does not exist, rather than throwing', () => {
    const out = reactToFilings({ sector: sector(), acts: [{ household_id: 'h-999', classification: 'D' }] });
    expect(out.changed).toEqual([]);
  });
});

describe('grievance hardens into a state a faction can use', () => {
  it('an angry household becomes available, once', () => {
    const household = { ...sector().households[0]!, grievance: 0.75 };
    const once = harden(household);
    expect(once.became).toBe('available');
    expect(harden(once.household).became).toBeNull();
  });

  it('a contented household becomes an informant', () => {
    const household = { ...sector().households[2]!, grievance: 0.05, loyalty: 0.85 };
    expect(harden(household).became).toBe('informant');
  });

  it('a household in the middle is neither, which is most of them', () => {
    expect(harden(sector().households[0]!).became).toBeNull();
  });
});

describe('the household that took it worst', () => {
  const sector = {
    shift: 3,
    households: [
      { id: 'h-001', block: 'kiln_row', grievance: 0.2, available: false, hardened: 0 },
      { id: 'h-002', block: 'kiln_row', grievance: 0.2, available: false, hardened: 0 },
      { id: 'h-003', block: 'canal_market', grievance: 0.2, available: false, hardened: 0 },
    ],
  } as never;

  it('names the household with the largest positive delta', () => {
    const reaction = reactToFilings({
      sector,
      acts: [
        { household_id: 'h-001', classification: 'P' },
        { household_id: 'h-003', classification: 'D' },
      ],
    });
    expect(reaction.worst?.household_id).toBe('h-003');
    expect(reaction.worst?.block).toBe('canal_market');
  });

  it('is null when nothing anyone filed made things worse', () => {
    const reaction = reactToFilings({ sector, acts: [{ household_id: 'h-001', classification: 'P' }] });
    expect(reaction.worst).toBeNull();
  });

  it('is null for an empty docket, rather than inventing a culprit', () => {
    const reaction = reactToFilings({ sector, acts: [] });
    expect(reaction.worst).toBeNull();
    expect(reaction.summary).toMatch(/took no notice/);
  });
});
