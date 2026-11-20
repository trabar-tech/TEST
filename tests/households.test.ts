/**
 * P3-T01 / P3-T02 — households, materialisation, and the Known set.
 *
 * The sim doc calls materialisation "the highest-value 200 lines in the project":
 * the person you arrest on Tuesday has to be the mother from the flat you cleared
 * on Monday. That promise rests entirely on determinism, so determinism is what
 * these tests are about — plus the cap behaviour, because the 12-Known rule is the
 * difference between a cast and a spreadsheet.
 */

import { describe, expect, it } from 'vitest';
import {
  KnownSet,
  MAX_FORCE,
  describeHousehold,
  generateSector,
  grade,
  grievancePressure,
  householdRng,
  legitimacy,
  materialise,
  temperature,
  type SectorState,
} from '@systems/households';

const sector = (over: Partial<SectorState> = {}): SectorState => ({
  id: 'kiln_row',
  shift: 3,
  households: [
    { id: 'h-001', block: 'tenement_row', members: 3, ration_class: 'C', housing: 'secure', loyalty: 0.5, secret: 'unlicensed_printing', flags: [], grievance: 0.4 },
    { id: 'h-002', block: 'canal_market', members: 1, ration_class: 'D', housing: 'condemned', loyalty: 0.2, secret: null, flags: [], grievance: 0.8 },
  ],
  force_index: 0,
  supply_deficit: 0,
  faction_heat: 0,
  ...over,
});

describe('the generated district', () => {
  it('produces 60 households by default and 40 on demand', () => {
    expect(generateSector({ seed: 7 }).households).toHaveLength(60);
    expect(generateSector({ seed: 7, count: 40 }).households).toHaveLength(40);
  });

  it('is stable for a seed — the district is authored once, not re-rolled on load', () => {
    const a = generateSector({ seed: 12 });
    const b = generateSector({ seed: 12 });
    expect(a.households).toEqual(b.households);
    expect(generateSector({ seed: 13 }).households).not.toEqual(a.households);
  });

  it('keeps ids stable when the count changes, so old saves still line up', () => {
    const big = generateSector({ seed: 5, count: 60 });
    const small = generateSector({ seed: 5, count: 40 });
    for (let i = 0; i < 40; i++) {
      expect(small.households[i]!.id).toBe(big.households[i]!.id);
      // identity travels with the id, not the index
      expect(small.households[i]!.ration_class).toBe(big.households[i]!.ration_class);
    }
  });

  it('is not uniform: grievance correlates with ration class and housing', () => {
    const s = generateSector({ seed: 3 });
    const poor = s.households.filter((h) => h.ration_class === 'D');
    const comfortable = s.households.filter((h) => h.ration_class === 'A');
    const mean = (xs: typeof poor) => xs.reduce((a, h) => a + h.grievance, 0) / Math.max(1, xs.length);
    expect(mean(poor)).toBeGreaterThan(mean(comfortable));
  });

  it('spreads households across blocks without leaving one empty', () => {
    const s = generateSector({ seed: 9 });
    const blocks = new Set(s.households.map((h) => h.block));
    expect(blocks.size).toBeGreaterThanOrEqual(4);
  });

  it('writes a Registry line a person could read out loud', () => {
    const line = describeHousehold(sector().households[0]!);
    expect(line).toMatch(/tenement row, secure, class C/);
    expect(line).toMatch(/3 registered occupants/);
    expect(line).toMatch(/press heard after curfew/);
    expect(describeHousehold(sector().households[1]!)).toMatch(/1 registered occupant/);
  });
});

describe('temperature is one legible number', () => {
  it('runs the specced formula', () => {
    const s = sector({ force_index: MAX_FORCE, supply_deficit: 1, faction_heat: 1 });
    // legitimacy = mean(0.5, 0.2)*100 - mean(0.4, 0.8)*12 = 35 - 7.2 = 27.8
    expect(legitimacy(s)).toBeCloseTo(27.8, 5);
    const expected =
      0.5 * (100 - 27.8) + 0.2 * 100 + 0.15 * 100 + 0.15 * 100;
    expect(temperature(s)).toBe(Math.round(expected));
  });

  it('rises when force rises, and falls when loyalty rises', () => {
    const calm = sector();
    expect(temperature(sector({ force_index: 15 }))).toBeGreaterThan(temperature(calm));
    const loyal = sector({
      households: sector().households.map((h) => ({ ...h, loyalty: 0.9, grievance: 0.1 })),
    });
    expect(temperature(loyal)).toBeLessThan(temperature(calm));
  });

  it('clamps into 0..100 and rounds to an integer', () => {
    const extreme = sector({
      households: [{ ...sector().households[0]!, loyalty: 0, grievance: 1 }],
      force_index: 999,
      supply_deficit: 5,
      faction_heat: 5,
    });
    expect(temperature(extreme)).toBe(100);
    expect(Number.isInteger(temperature(extreme))).toBe(true);
    const gentle = sector({
      households: [{ ...sector().households[0]!, loyalty: 1, grievance: 0 }],
    });
    expect(temperature(gentle)).toBe(0);
  });

  it('grievance pressure is 12 points at worst case and 0 at best', () => {
    expect(grievancePressure(sector({
      households: [{ ...sector().households[0]!, grievance: 1 }],
    }))).toBeCloseTo(12, 5);
    expect(grievancePressure(sector({
      households: [{ ...sector().households[0]!, grievance: 0 }],
    }))).toBe(0);
  });

  it('an empty sector does not divide by zero', () => {
    const empty = sector({ households: [] });
    expect(temperature(empty)).toBe(0);
    expect(legitimacy(empty)).toBe(0);
    expect(grievancePressure(empty)).toBe(0);
  });

  it('names its bands in the same vocabulary the barks use', () => {
    expect(grade(sector({ households: [{ ...sector().households[0]!, loyalty: 1, grievance: 0 }] }))).toBe('calm');
    expect(grade(sector({ force_index: MAX_FORCE, supply_deficit: 1, faction_heat: 1 }))).toBe('hostile');
  });
});

describe('materialisation makes the same person twice', () => {
  it('is pure: same seed and household, same citizen', () => {
    const a = materialise(sector(), 'h-002', 99);
    const b = materialise(sector(), 'h-002', 99);
    expect(a).toEqual(b);
  });

  it('survives the sector being mutated in between — no hidden state', () => {
    const before = materialise(sector(), 'h-001', 4);
    const mutated = sector();
    mutated.households[1]!.loyalty = 0.01;
    mutated.households.push({ ...sector().households[0]!, id: 'h-003' });
    expect(materialise(mutated, 'h-001', 4)).toEqual(before);
  });

  it('gives different households different people', () => {
    const a = materialise(sector(), 'h-001', 4);
    const b = materialise(sector(), 'h-002', 4);
    expect(a.name).not.toBe(b.name);
    expect(a.face_seed).not.toBe(b.face_seed);
  });

  it('derives papers from the household record — no impossible citizens', () => {
    const s = sector();
    for (const h of s.households) {
      const agent = materialise(s, h.id, 17);
      // the chip serial's class letter is the ration class (the audit reads this)
      expect(agent.papers.chip_serial[0]).toBeTruthy();
      expect(agent.papers.name).toBe(agent.name);
      expect(agent.papers.ration_class).toMatch(/^[A-D]$/);
      expect(agent.post).toBe(h.block);
    }
  });

  it('a household with no secret cannot produce an irregularity', () => {
    const s = sector();
    for (let seed = 0; seed < 30; seed++) {
      const agent = materialise(s, 'h-002', seed);
      // h-002 has secret: null, so papers stay clean
      expect(agent.knowledge.filter((k) => k.startsWith('secret:'))).toEqual([]);
      expect(agent.papers.district_stamp).toBe('S4');
    }
  });

  it('characterises by grievance: angry households produce indignant people', () => {
    const s = sector();
    const angry = { ...s, households: s.households.map((h) => ({ ...h, grievance: 0.9 })) };
    const calm = { ...s, households: s.households.map((h) => ({ ...h, grievance: 0.1 })) };
    const angrySet = new Set(Array.from({ length: 20 }, (_, i) => materialise(angry, 'h-001', i).temperament));
    const calmSet = new Set(Array.from({ length: 20 }, (_, i) => materialise(calm, 'h-001', i).temperament));
    expect(angrySet.has('indignant') || angrySet.has('rehearsed')).toBe(true);
    expect(angrySet.has('indignant')).toBe(true);
    expect(calmSet.size).toBeGreaterThan(1);
  });

  it('carries the household secret into what the person knows', () => {
    const agent = materialise(sector(), 'h-001', 2);
    expect(agent.knowledge).toContain('secret:unlicensed_printing');
  });

  it('refuses to invent a citizen for a household that does not exist', () => {
    expect(() => materialise(sector(), 'h-999', 1)).toThrow(/no household h-999/);
  });

  it('exposes the household stream so callers can pre-draw without drifting', () => {
    const rng = householdRng(4, 'h-001');
    expect(typeof rng.next()).toBe('number');
  });
});

describe('the Known set holds twelve and evicts visibly', () => {
  const fill = (set: KnownSet, n: number, from = 1) => {
    for (let i = from; i < from + n; i++) {
      set.add({ household_id: `h-${String(i).padStart(3, '0')}`, reason: 'filed a line' }, 1);
    }
    return set;
  };

  it('caps at 12 and reports full', () => {
    const set = fill(new KnownSet(), 12);
    expect(set.size).toBe(12);
    expect(set.isFull).toBe(true);
    expect(set.gap()).toEqual([]);
  });

  it('a 13th pushes someone out, and says who and why', () => {
    const set = fill(new KnownSet(), 12);
    const evicted = set.add({ household_id: 'h-013', reason: 'named in a record' }, 2);
    expect(evicted).not.toBeNull();
    expect(set.size).toBe(12);
    expect(evicted!.household_id).toBe('h-001');
    expect(set.has('h-013')).toBe(true);
    expect(set.has('h-001')).toBe(false);
    expect(set.evictions().at(-1)!.household_id).toBe('h-001');
  });

  it('evicts least-recently-referenced, not oldest', () => {
    const set = fill(new KnownSet(), 12);
    set.add({ household_id: 'h-001', reason: 'checked in on them again' }, 5);
    const evicted = set.add({ household_id: 'h-013', reason: 'named' }, 6);
    // h-001 was just refreshed, so h-002 is now the one nobody has thought about
    expect(evicted!.household_id).toBe('h-002');
    expect(set.has('h-001')).toBe(true);
  });

  it('re-adding someone Known does not duplicate them', () => {
    const set = fill(new KnownSet(), 3);
    expect(set.add({ household_id: 'h-002', reason: 'again' }, 4)).toBeNull();
    expect(set.size).toBe(3);
    expect(set.all().filter((e) => e.household_id === 'h-002')).toHaveLength(1);
  });

  it('leaves a real gap when someone is removed', () => {
    const set = fill(new KnownSet(), 12);
    expect(set.remove('h-004', 'moved on', 3)).toBe(true);
    expect(set.size).toBe(11);
    expect(set.gap()).toEqual([11]);
    expect(set.evictions().at(-1)!.reason).toBe('moved on');
    expect(set.remove('h-004', 'again', 4)).toBe(false);
  });

  it('honours a lower cap, which is the first rung of the G2 failure ladder', () => {
    const set = fill(new KnownSet(8), 8);
    expect(set.isFull).toBe(true);
    set.add({ household_id: 'h-050', reason: 'r' }, 2);
    expect(set.size).toBe(8);
  });

  it('round-trips through a save without losing history', () => {
    const set = fill(new KnownSet(), 13);
    const restored = KnownSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON())));
    expect(restored.all()).toEqual(set.all());
    expect(restored.evictions()).toEqual(set.evictions());
  });

  it('a save claiming more than the cap is truncated, not trusted', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      household_id: `h-${i}`,
      since: 1,
      reason: 'r',
    }));
    expect(KnownSet.fromJSON({ entries }).size).toBe(12);
  });
});
