/**
 * P3-T06..T09 — the Desk, the Arbiter, the Eye, and the Cell's plans.
 *
 * The phase's gate question is "does the city feel alive and unfair *in the right
 * way*". Unfair-in-the-right-way is a fairness property, so these tests are mostly
 * about **explainability**: every director decision must be able to say why in one
 * clause, and the Arbiter must never quietly shrink a budget.
 */

import { describe, expect, it } from 'vitest';
import { streamFor } from '@core/rng';
import {
  FAULT_LINES,
  arbitrate,
  chooseDirectives,
  dominantFault,
  eyeTick,
  newArbiter,
  newEye,
  notice,
  observe,
  permitsArmedIncident,
  permitsThreat,
  type ArbiterInput,
  type FaultVector,
} from '@systems/directors';
import {
  advancePlan,
  decayGrudges,
  describePlan,
  readPlan,
  startPlan,
  type Grudge,
  type PlanDef,
  type PlanWorld,
} from '@systems/plans';

const input = (over: Partial<ArbiterInput> = {}): ArbiterInput => ({
  shift: 3,
  temperature: 40,
  storyletsConsumed: 0,
  incidentsDispatched: 0,
  quietScenesPlayed: 0,
  forceCommitted: 0,
  deaths: 0,
  factionPlanCompleted: false,
  incidentResolved: false,
  ...over,
});

describe('the Desk reads behaviour, not morality', () => {
  it('starts with no opinion', () => {
    expect(newArbiter().state).toBe('calm');
    expect(dominantFault({})).toBeNull();
  });

  it('remembers brutality longer than it remembers one bad night', () => {
    const after = observe({}, { force_weight: 9, rungs_used: [5], deaths: 1 } as never);
    expect(after.brutality).toBeGreaterThan(0.5);
    // a single quiet shift does not clear the picture
    const next = observe(after, {});
    expect(next.brutality).toBeGreaterThan(0.4);
    // ten quiet shifts do
    let vector = next;
    for (let i = 0; i < 10; i++) vector = observe(vector, {});
    expect(vector.brutality).toBeLessThan(0.25);
  });

  it('notices paperwork neglect only when there were arrests to file', () => {
    expect(observe({}, { arrests: 0 }).paperwork_neglect).toBe(0);
    expect(observe({}, { arrests: 2, records_filed: 2 }).paperwork_neglect).toBe(0);
    expect(observe({}, { arrests: 2, records_filed: 0 }).paperwork_neglect).toBeGreaterThan(0);
  });

  it('flags an authorisation with no report behind it', () => {
    const v = observe({}, { authorisations_filed: 1, records_filed: 0, rungs_used: [4] });
    expect(v.over_authorisation).toBeGreaterThan(0);
  });

  it('never exceeds 1 on any line, however long the campaign', () => {
    let v: FaultVector = {};
    for (let i = 0; i < 40; i++) v = observe(v, { force_weight: 9, rungs_used: [5], deaths: 1 } as never);
    for (const line of FAULT_LINES) expect(v[line]!).toBeLessThanOrEqual(1);
  });

  it('names the habit it is leaning on', () => {
    const v = observe({}, { arrests: 3, records_filed: 0 });
    expect(dominantFault(v)).toBe('paperwork_neglect');
  });
});

describe('directives explain themselves', () => {
  const candidates = [
    { id: 'd-rumour', fault_lines: ['paperwork_neglect'], pressure: 0.4 },
    { id: 'd-sweep', fault_lines: ['brutality'], pressure: 0.8 },
    { id: 'd-bins', pressure: 0.1 },
  ];

  it('picks the number asked for, without duplicates', () => {
    const picks = chooseDirectives(candidates, { brutality: 0.9 }, { count: 2, temperature: 40, rng: streamFor(1, 1, 'desk') });
    expect(picks).toHaveLength(2);
    expect(new Set(picks.map((p) => p.directiveId)).size).toBe(2);
  });

  it('leans toward the player\'s worst habit but is not deterministic about it', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const picks = chooseDirectives(candidates, { paperwork_neglect: 0.9 }, {
        count: 1, temperature: 30, rng: streamFor(seed, 2, 'desk'),
      });
      seen.add(picks[0]!.directiveId);
    }
    // the fault-aligned card wins most often, but the district is not a single note
    expect(seen.has('d-rumour')).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('gives every pick a reason in the Desk\'s own words', () => {
    const picks = chooseDirectives(candidates, { paperwork_neglect: 0.9 }, {
      count: 3, temperature: 30, rng: streamFor(3, 2, 'desk'),
    });
    for (const p of picks) {
      expect(p.reason.length).toBeGreaterThan(10);
      expect(p.reason).not.toMatch(/undefined/);
    }
    expect(picks.some((p) => /your files have stopped matching your nights/.test(p.reason))).toBe(true);
  });

  it('falls back to routine allocation rather than inventing a fault', () => {
    const picks = chooseDirectives([{ id: 'd-bins' }], {}, { count: 1, temperature: 20, rng: streamFor(1, 1, 'desk') });
    expect(picks[0]!.reason).toBe('routine allocation for the district');
  });

  it('handles an empty pool', () => {
    expect(chooseDirectives([], {}, { count: 3, temperature: 20, rng: streamFor(1, 1, 'desk') })).toEqual([]);
  });
});

describe('the Arbiter owns budgets, not content', () => {
  it('opens calm and arms nothing', () => {
    const s = newArbiter(3);
    expect(permitsArmedIncident(s, 0)).toBe(false);
    expect(permitsThreat(s)).toBe(true);
  });

  it('calm escalates on three storylets', () => {
    const s = arbitrate(newArbiter(3), input({ storyletsConsumed: 3 }));
    expect(s.state).toBe('build');
    expect(s.why).toBe('3 storylets consumed');
    expect(permitsArmedIncident(s, 0)).toBe(true);
  });

  it('calm escalates on heat alone, and says the number', () => {
    const s = arbitrate(newArbiter(3), input({ temperature: 61 }));
    expect(s.state).toBe('build');
    expect(s.why).toMatch(/temperature 61 passed 60/);
  });

  it('build peaks when an incident is dispatched, and permits exactly one armed incident', () => {
    const build = arbitrate(newArbiter(3), input({ storyletsConsumed: 3 }));
    const peak = arbitrate(build, input({ incidentsDispatched: 1 }));
    expect(peak.state).toBe('peak');
    expect(permitsArmedIncident(peak, 0)).toBe(false);
    expect(permitsArmedIncident(build, 0)).toBe(true);
    expect(permitsArmedIncident(build, 1)).toBe(false);
  });

  it('peak holds until the scene resolves — no new incidents pile up', () => {
    const peak = arbitrate(arbitrate(newArbiter(3), input({ storyletsConsumed: 3 })), input({ incidentsDispatched: 1 }));
    const still = arbitrate(peak, input({ incidentsDispatched: 2, storyletsConsumed: 9 }));
    expect(still.state).toBe('peak');
  });

  it('release forbids threats entirely, and lasts a full shift', () => {
    const build = arbitrate(newArbiter(3), input({ storyletsConsumed: 3 }));
    const release = arbitrate(build, input({ deaths: 1 }));
    expect(release.state).toBe('release');
    expect(permitsThreat(release)).toBe(false);
    expect(release.why).toBe('someone died');

    const stillSameShift = arbitrate(release, input({ shift: 3 }));
    expect(stillSameShift.state).toBe('release');

    const nextShift = arbitrate(release, input({ shift: 4 }));
    expect(nextShift.state).toBe('calm');
  });

  it('lethal force releases even without a death, and says so', () => {
    const build = arbitrate(newArbiter(3), input({ storyletsConsumed: 3 }));
    const release = arbitrate(build, input({ forceCommitted: 6 }));
    expect(release.state).toBe('release');
    expect(release.why).toMatch(/lethal or collective force/);
  });

  it('a resolved incident returns to calm when nothing ugly happened', () => {
    const build = arbitrate(newArbiter(3), input({ storyletsConsumed: 3 }));
    const peak = arbitrate(build, input({ incidentsDispatched: 1 }));
    expect(arbitrate(peak, input({ incidentResolved: true })).state).toBe('calm');
    expect(arbitrate(peak, input({ incidentResolved: true, deaths: 1 })).state).toBe('release');
  });

  it('keeps its state when nothing changes, and its why-line with it', () => {
    const build = arbitrate(newArbiter(3), input({ storyletsConsumed: 3 }));
    const again = arbitrate(build, input({ storyletsConsumed: 3 }));
    expect(again).toEqual(build);
  });

  it('is deterministic across a scripted shift', () => {
    const run = () => {
      const script = [
        input({ storyletsConsumed: 1 }),
        input({ storyletsConsumed: 3 }),
        input({ incidentsDispatched: 1 }),
        input({ incidentResolved: true }),
        input({ shift: 4 }),
      ];
      let s = newArbiter(3);
      for (const step of script) s = arbitrate(s, step);
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe('the Eye is a gauge, not a planner', () => {
  it('rises on detection and cools with restraint', () => {
    const one = notice(newEye(), 1, { why: 'a record contradicted itself' });
    expect(one.attention).toBeGreaterThan(0);
    expect(one.lastWhy).toBe('a record contradicted itself');
    const rest = eyeTick(eyeTick(one, 2), 3);
    expect(rest.attention).toBeLessThan(one.attention);
  });

  it('climbs the ladder: one detection is noticed, five is pulled', () => {
    let eye = newEye();
    eye = notice(eye, 1, { why: 'a' });
    expect(eye.level).toBe(1);
    eye = notice(eye, 1, { why: 'b' });
    expect(eye.level).toBe(2);
    eye = notice(eye, 2, { why: 'c' });
    eye = notice(eye, 2, { why: 'd' });
    expect(eye.level).toBe(3);
    eye = notice(eye, 3, { why: 'e' });
    expect(eye.level).toBe(4);
  });

  it('forgets detections older than three shifts', () => {
    let eye = notice(newEye(), 1, { why: 'a' });
    eye = notice(eye, 1, { why: 'b' });
    expect(eye.level).toBe(2);
    for (let shift = 2; shift <= 6; shift++) eye = eyeTick(eye, shift);
    expect(eye.level).toBe(0);
    expect(eye.lastWhy).toBe('nothing has been noticed for three shifts');
  });

  it('a single severe detection costs more attention than a mild one', () => {
    const mild = notice(newEye(), 1, { why: 'x', severity: 1 });
    const severe = notice(newEye(), 1, { why: 'x', severity: 3 });
    expect(severe.attention).toBeGreaterThan(mild.attention);
    // and attention is a gauge: it stays in 0..1
    expect(notice(severe, 1, { why: 'y', severity: 5 }).attention).toBeLessThanOrEqual(1);
  });

  it('never plans: the same eye state always yields the same rung', () => {
    const eye = notice(notice(newEye(), 1, { why: 'a' }), 1, { why: 'b' });
    expect(eyeTick(eye, 2).level).toBe(eye.level);
  });
});

describe('the Cell plans three shifts ahead, and can be read', () => {
  const def: PlanDef = {
    id: 'arm_cell_2',
    faction: 'cell',
    produces: 'checkpoint_bombing',
    recruitNeeds: { grievanceAtLeast: 0.6 },
    needsSite: 'safehouse',
  };
  const world = (over: Partial<PlanWorld> = {}): PlanWorld => ({
    households: [
      { id: 'h-001', grievance: 0.9, flags: [] },
      { id: 'h-002', grievance: 0.2, flags: [] },
      { id: 'h-003', grievance: 0.7, flags: ['informant'] },
    ],
    safehouses: ['printery_b', 'flat_14'],
    ...over,
  });

  it('runs procure → recruit → strike over three shifts', () => {
    const rng = streamFor(1, 1, 'cell');
    let inst = startPlan(def, world(), 0);
    const a = advancePlan(inst, world(), 0, rng);
    expect(a.instance.step).toBe(1);
    expect(a.instance.siteId).toBeTruthy();
    const b = advancePlan(a.instance, world(), 1, rng);
    expect(b.instance.step).toBe(2);
    // recruits only from the angry, and never an informant
    expect(['h-001']).toContain(b.instance.recruitId);
    const c = advancePlan(b.instance, world(), 2, rng);
    expect(c.produces).toBe('checkpoint_bombing');
    expect(c.instance.status).toBe('completed');
    expect(c.antagonism).toBe(2);
  });

  it('a burned safehouse spends the Cell\'s shift and raises antagonism', () => {
    const rng = streamFor(1, 1, 'cell');
    const inst = startPlan(def, world(), 0);
    const out = advancePlan(inst, world({ deniedSites: ['printery_b', 'flat_14'] }), 0, rng);
    expect(out.instance.step).toBe(0);
    expect(out.instance.resets).toBe(1);
    expect(out.antagonism).toBe(1);
    expect(out.report[0]).toMatch(/cannot find room/);
  });

  it('two failures and the Cell stops, rather than looping forever', () => {
    const rng = streamFor(1, 1, 'cell');
    let inst = startPlan(def, world(), 0);
    inst = advancePlan(inst, world({ deniedSites: ['printery_b', 'flat_14'] }), 0, rng).instance;
    const out = advancePlan(inst, world({ deniedSites: ['printery_b', 'flat_14'] }), 1, rng);
    expect(out.instance.status).toBe('failed');
    // and a failed plan ticks to nothing, so it cannot keep generating antagonism
    expect(advancePlan(out.instance, world(), 2, rng).antagonism).toBe(0);
  });

  it('arresting the wrong person records a grudge — with a cause, not a rivalry', () => {
    const rng = streamFor(1, 1, 'cell');
    let inst = advancePlan(startPlan(def, world(), 0), world(), 0, rng).instance;
    const out = advancePlan(inst, world({ arrestsThisShift: 1 }), 1, rng);
    expect(out.grudge).toBeDefined();
    expect(out.grudge!.causeLineId).toBe('arrest_of_recruit');
    expect(out.grudge!.satisfyingActions).toContain('release_from_detention');
    // a grudge is a record, not a nemesis: it has no rank, no promotion, no scar
    expect(Object.keys(out.grudge!).sort()).toEqual(
      ['causeLineId', 'citizenId', 'decayRule', 'intensity', 'satisfyingActions'].sort(),
    );
  });

  it('a watched street interrupts the strike', () => {
    const rng = streamFor(1, 1, 'cell');
    let inst = advancePlan(startPlan(def, world(), 0), world(), 0, rng).instance;
    inst = advancePlan(inst, world(), 1, rng).instance;
    const out = advancePlan(inst, world({ curfewEnforced: true }), 2, rng);
    expect(out.produces).toBeUndefined();
    expect(out.report[0]).toMatch(/streets were watched/);
  });

  it('informants turn the plan into a puzzle, deterministically', () => {
    const inst = startPlan(def, world(), 0);
    expect(readPlan(inst, 0.2)).toBeNull();
    expect(readPlan(inst, 0.5)).toMatch(/procure/);
    expect(readPlan(inst, 0.9)).toMatch(/a safehouse/);
    // reading twice says the same thing: an informant who sometimes lies is a bug
    expect(readPlan(inst, 0.9)).toBe(readPlan(inst, 0.9));
  });

  it('describes itself for the briefing screen', () => {
    expect(describePlan(startPlan(def, world(), 0))).toBe('cell: running at procure');
  });

  it('grudges decay to nothing and then are simply forgotten', () => {
    const grudge: Grudge = {
      citizenId: 'h-001',
      causeLineId: 'arrest_of_recruit',
      intensity: 0.36,
      decayRule: 'per_shift' as const,
      satisfyingActions: ['release_from_detention'],
    };
    expect(decayGrudges([grudge], 1)).toHaveLength(1);
    expect(decayGrudges([grudge, grudge, grudge], 1)).toHaveLength(3);
    expect(decayGrudges([decayGrudges([grudge], 1)[0]!, decayGrudges([grudge], 1)[0]!], 2).length).toBeGreaterThan(0);
    let current: Grudge[] = [grudge];
    for (let i = 0; i < 5; i++) current = decayGrudges(current, i);
    expect(current).toEqual([]);
  });
});
