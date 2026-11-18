/**
 * P1-T01 acceptance: the Record as data.
 *  - slack() is a pure function with a fixed table
 *  - a line survives save → load → belief() identically
 *  - belief() is computed from claims only, never from truth
 */

import { describe, expect, it } from 'vitest';
import {
  RecordStore,
  claimOf,
  computeExposure,
  makeLine,
  riskBand,
  slack,
  type Claim,
  type Truth,
} from '@core/record';
import { stateHash } from '@core/hash';

const truth = (over: Partial<Truth> = {}): Truth => ({
  classification: 'C',
  force_rung: 2,
  detainees: 1,
  casualties: 0,
  damage: 1,
  third_party_present: false,
  illegal_search: false,
  bribe_taken: false,
  ...over,
});

const claim = (over: Partial<Claim> = {}): Claim => ({
  classification: 'C',
  force_rung: 2,
  detainees: 1,
  casualties: 0,
  damage: 1,
  ...over,
});

describe('slack', () => {
  it('is zero for a claim identical to the truth', () => {
    expect(slack(claimOf(truth()), truth())).toBe(0);
  });

  it('matches the specified table', () => {
    // each row is (description, claim override, truth override, expected slack)
    const table: Array<[string, Partial<Claim>, Partial<Truth>, number]> = [
      ['classification lie only', { classification: 'P' }, {}, 0.35],
      ['force lie only', { force_rung: 4 }, {}, 0.25],
      ['one detainee missing', { detainees: 0 }, {}, 0.15],
      ['two detainees missing, capped', { detainees: 0 }, { detainees: 2 }, 0.3],
      ['detainee over-count', { detainees: 5 }, {}, 0.3],
      ['damage one rung off', { damage: 2 }, {}, 0.1],
      ['all three unmentioned', {}, { third_party_present: true, illegal_search: true, bribe_taken: true }, 0.6],
      ['everything wrong, clamped', { classification: 'P', force_rung: 5, detainees: 0, damage: 0 }, {}, 0.35 + 0.25 + 0.15 + 0.1],
      ['bribe disclosed via property', { property: ['bribe_taken'] }, { bribe_taken: true }, 0],
      ['third party omitted', {}, { third_party_present: true }, 0.2],
    ];
    for (const [label, c, t, expected] of table) {
      expect(slack(claim(c), truth(t)), label).toBeCloseTo(expected, 6);
    }
  });

  it('never exceeds 1', () => {
    const worst = slack(
      { classification: 'P', force_rung: 5, detainees: 0, casualties: 0, damage: 0 },
      truth({ third_party_present: true, illegal_search: true, bribe_taken: true }),
    );
    expect(worst).toBeLessThanOrEqual(1);
    expect(worst).toBe(1);
  });

  it('is symmetric in the sense that over- and under-reporting both count', () => {
    expect(slack(claim({ detainees: 0 }), truth())).toBe(slack(claim({ detainees: 2 }), truth()));
  });
});

describe('RecordStore', () => {
  const line = (id: string, over: Parameters<typeof makeLine>[0] extends infer T ? Partial<T> : never = {}) =>
    makeLine({
      id,
      shift: 1,
      event_ref: 'me-0031',
      category: 'inspection',
      claim: claim(),
      truth: truth(),
      ...over,
    });

  it('assigns sequential ids per shift', () => {
    const store = new RecordStore();
    expect(store.nextId(1)).toBe('r-1-01');
    store.append(line(store.nextId(1)));
    expect(store.nextId(1)).toBe('r-1-02');
    expect(store.nextId(2)).toBe('r-2-01');
  });

  it('refuses duplicate ids', () => {
    const store = new RecordStore();
    store.append(line('r-1-01'));
    expect(() => store.append(line('r-1-01'))).toThrow(/duplicate/);
  });

  it('belief counts claims, not truth', () => {
    const store = new RecordStore();
    // the truth is R (resistance), but the claim says P
    store.append(line('r-1-01', { claim: claim({ classification: 'P' }), truth: truth({ classification: 'R' }) }));
    store.append(line('r-1-02', { claim: claim({ classification: 'R' }), truth: truth({ classification: 'P' }) }));
    const b = store.belief();
    expect(b.resistance_estimate).toBe(1); // only the line that *claims* R
    expect(b.lines).toBe(2);
  });

  it('belief is insensitive to truth: two stores, same claims, different truths', () => {
    const a = new RecordStore();
    const b = new RecordStore();
    a.append(line('r-1-01', { truth: truth({ classification: 'R', force_rung: 5 }) }));
    b.append(line('r-1-01', { truth: truth({ classification: 'P', force_rung: 1 }) }));
    expect(a.belief()).toEqual(b.belief());
  });

  it('records brutality and syndicate presence from claims and tags', () => {
    const store = new RecordStore();
    store.append(line('r-1-01', { claim: claim({ force_rung: 4 }) }));
    store.append(line('r-1-02', { tags: ['syndicate'] }));
    const b = store.belief();
    expect(b.brutality_index).toBe(1);
    expect(b.syndicate_presence).toBe(1);
  });

  it('counts grievances from C and D claims', () => {
    const store = new RecordStore();
    store.append(line('r-1-01', { claim: claim({ classification: 'C' }), event_ref: 'c-0221' }));
    store.append(line('r-1-02', { claim: claim({ classification: 'D' }), event_ref: 'c-0304' }));
    store.append(line('r-1-03', { claim: claim({ classification: 'P' }), event_ref: 'c-0500' }));
    expect(store.belief().grievance_list).toEqual(['c-0221', 'c-0304']);
  });

  it('dries lines after their lifespan and reports which', () => {
    const store = new RecordStore();
    store.append(line('r-1-01'));
    store.append(line('r-1-02'));
    for (let i = 0; i < 5; i++) expect(store.age()).toHaveLength(0);
    expect(store.age()).toHaveLength(2); // the 6th shift
    expect(store.live()).toHaveLength(0);
    expect(store.archive()).toHaveLength(2);
  });

  it('slow aging alone never cracks a line; only a contradiction does', () => {
    const store = new RecordStore();
    store.append(line('r-1-01'));
    for (let i = 0; i < 5; i++) store.age();
    // decay outruns nothing: still above the crack threshold, and about to dry
    expect(store.cracked()).toHaveLength(0);

    // 5 shifts of decay: 1 - 0.25 = 0.75
    expect(store.byId('r-1-01')!.stability).toBeCloseTo(0.75, 6);
    store.destabilise(['r-1-01']);
    expect(store.byId('r-1-01')!.stability).toBeCloseTo(0.35, 6);
    store.destabilise(['r-1-01']);
    const cracked = store.cracked();
    expect(cracked).toHaveLength(1);
    expect(cracked[0]!.stability).toBeCloseTo(0, 6);
    expect(cracked[0]!.lifespan).toBeGreaterThan(0); // still live, so it is *shown*
  });

  it('corroboration strengthens a line, capped at 1', () => {
    const store = new RecordStore();
    store.append(line('r-1-01'));
    store.destabilise(['r-1-01']);
    store.corroborate('r-1-01');
    expect(store.byId('r-1-01')!.stability).toBeCloseTo(0.8, 6);
    for (let i = 0; i < 5; i++) store.corroborate('r-1-01');
    expect(store.byId('r-1-01')!.stability).toBe(1);
  });

  it('query filters compose', () => {
    const store = new RecordStore();
    store.append(line('r-1-01', { tags: ['crowd'], category: 'inspection' }));
    store.append(line('r-1-02', { tags: ['crowd'], category: 'patrol' }));
    store.append(line('r-1-03', { tags: ['bribe'], category: 'patrol' }));
    expect(store.query({ tag: 'crowd' })).toHaveLength(2);
    expect(store.query({ tag: 'crowd', category: 'patrol' })).toHaveLength(1);
    expect(store.query({ shift: 2 })).toHaveLength(0);
  });

  it('round-trips through JSON identically', () => {
    const store = new RecordStore();
    store.append(line('r-1-01', { tags: ['crowd'], free_text: 'He ran. I wrote that he walked.' }));
    store.append(line('r-1-02', { claim: claim({ classification: 'D', force_rung: 3 }) }));
    const json = JSON.parse(JSON.stringify(store.toJSON()));
    const other = new RecordStore();
    other.restore(json);
    expect(other.hash()).toBe(store.hash());
    expect(other.belief()).toEqual(store.belief());
    expect(stateHash(other.toJSON())).toBe(stateHash(store.toJSON()));
  });

  it('does not alias lines between a store and its restored copy', () => {
    const store = new RecordStore();
    store.append(line('r-1-01'));
    const other = new RecordStore();
    other.restore(store.toJSON());
    other.archive()[0]!.claim.detainees = 99;
    expect(store.archive()[0]!.claim.detainees).toBe(1);
  });
});

describe('exposure', () => {
  it('is zero when the claim is honest, whatever is watching', () => {
    const e = computeExposure({
      candidate: claimOf(truth()),
      truth: truth(),
      cameras: ['cam:K4-2'],
      witnesses: [{ id: 'c-0221', reliability: 1, will_talk: 1 }],
      contradictions: ['r-1-01'],
    });
    expect(e.risk_score).toBe(0);
    expect(riskBand(e.risk_score)).toBe('safe');
  });

  it('rises with cameras, witnesses and contradictions', () => {
    const base = computeExposure({
      candidate: claim({ classification: 'P' }),
      truth: truth(),
      cameras: [],
      witnesses: [],
      contradictions: [],
    });
    const watched = computeExposure({
      candidate: claim({ classification: 'P' }),
      truth: truth(),
      cameras: ['cam:K4-2'],
      witnesses: [{ id: 'c-0221', reliability: 1, will_talk: 1 }],
      contradictions: ['r-1-01'],
    });
    expect(watched.risk_score).toBeGreaterThan(base.risk_score);
    // a camera-observed lie is never "safe": the bench answers for it
    expect(riskBand(watched.risk_score)).toBe('hanging');
  });

  it('a lie nobody saw is safe — you can hide almost anything, exactly once', () => {
    const e = computeExposure({
      candidate: claim({ classification: 'P', detainees: 0 }),
      truth: truth(),
      cameras: [],
      witnesses: [],
      contradictions: [],
    });
    expect(e.risk_score).toBe(0);
    expect(riskBand(e.risk_score)).toBe('safe');
  });

  it('a camera makes even a small lie hanging: certainty, not magnitude', () => {
    // a single-rung damage discrepancy is a small lie, but the camera saw it
    const e = computeExposure({
      candidate: claim({ damage: 2 }),
      truth: truth(),
      cameras: ['cam:K4-2'],
      witnesses: [],
      contradictions: [],
    });
    expect(riskBand(e.risk_score)).toBe('hanging');
  });

  it('bands are stable at the boundaries', () => {
    expect(riskBand(0.19)).toBe('safe');
    expect(riskBand(0.2)).toBe('thin');
    expect(riskBand(0.49)).toBe('thin');
    expect(riskBand(0.5)).toBe('hanging');
  });
});
