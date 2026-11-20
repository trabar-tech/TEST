/**
 * P3-T03 / P3-T10 / P3-T12 — one shift wired together, and the Inspector that has
 * to explain it.
 *
 * The Inspector is the fairness contract. G2 asks a tester to say *why* something
 * bad happened; if `inspectShift()` cannot produce that sentence from the same
 * numbers the director used, the shift was unfair (RISK R17). So these tests check
 * that the explanation always exists, always names a cause, and never invents a
 * factor the draw did not use.
 */

import { describe, expect, it } from 'vitest';
import { streamFor } from '@core/rng';
import {
  citizenAt,
  createShowrunner,
  householdHeat,
  inspectShift,
  inspectionMarkdown,
  meet,
  reportDetection,
  runShift,
  type ShowrunnerState,
} from '@systems/showrunner';
import type { Storylet } from '@core/content';

const card = (id: string, over: Record<string, unknown> = {}): Storylet =>
  ({
    id,
    title: id,
    requires: {},
    references: [],
    deck: 'beat_morning',
    pressure: 0.5,
    fault_lines: [],
    weight: { base: 1, connective_bonus: 0 },
    beats: [{ text: 'x' }],
    resolutions: [{ id: 'a', label: 'A', claim: 'P', legitimacy: 0, standing: 0, integrity: 0, time: 0 }],
    ...over,
  }) as unknown as Storylet;

const CARDS: Storylet[] = [
  card('m-quiet', { pressure: 0.1 }),
  card('m-loud', { pressure: 0.8 }),
  card('m-market', { pressure: 0.4 }),
  card('d-rumour', { deck: 'desk', fault_lines: ['paperwork_neglect'], pressure: 0.3 }),
  card('d-sweep', { deck: 'desk', fault_lines: ['brutality'], pressure: 0.9 }),
];

const run = (state: ShowrunnerState, over: Record<string, unknown> = {}) =>
  runShift(state, CARDS, { rng: streamFor(state.seed, state.shift, 'storylets'), ...over });

describe('a shift runs end to end', () => {
  it('starts from a generated district of 60 households', () => {
    const state = createShowrunner({ seed: 42 });
    expect(state.sector.households).toHaveLength(60);
    expect(state.shift).toBe(0);
    expect(state.known.size).toBe(0);
  });

  it('produces content, a rating, and a report', () => {
    const state = createShowrunner({ seed: 42 });
    const out = run(state);
    expect(out.storylets.length).toBeGreaterThan(0);
    expect(out.temperature).toBeGreaterThanOrEqual(0);
    expect(out.legitimacy).toBeGreaterThanOrEqual(0);
    expect(['calm', 'wary', 'braced', 'hostile']).toContain(out.grade);
    expect(out.arbiter.state).toBe('calm');
    expect(state.shift).toBe(1);
  });

  it('advances the shift, so two runs are different days', () => {
    const state = createShowrunner({ seed: 7 });
    const a = run(state);
    const b = run(state);
    expect(a.shift).toBe(0);
    expect(b.shift).toBe(1);
  });

  it('is fully deterministic for a seed, across the whole composition', () => {
    const runTwice = () => {
      const state = createShowrunner({ seed: 1234 });
      const a = run(state, { forceCommitted: 3, arrests: 1, recordsFiled: 0 });
      const b = run(state, { forceCommitted: 9, deaths: 1 });
      return { a, b, known: state.known.all(), shift: state.shift };
    };
    expect(runTwice()).toEqual(runTwice());
  });

  it('heats the district when force is used, and cools it when it is not', () => {
    const hot = createShowrunner({ seed: 3 });
    const hotOut = run(hot, { forceCommitted: 9 });
    const cool = createShowrunner({ seed: 3 });
    const coolOut = run(cool, { forceCommitted: 0 });
    expect(hotOut.temperature).toBeGreaterThan(coolOut.temperature);
  });

  it('accumulates force into the sector, so brutality compounds', () => {
    const state = createShowrunner({ seed: 3 });
    const before = state.sector.force_index;
    run(state, { forceCommitted: 6 });
    expect(state.sector.force_index).toBeGreaterThan(before);
  });

  it('a lethal shift releases: no sharp content is drawn', () => {
    const state = createShowrunner({ seed: 3 });
    run(state, { forceCommitted: 3 });
    const out = run(state, { forceCommitted: 9, deaths: 1, rng: streamFor(3, 1, 'storylets') });
    expect(out.arbiter.state).toBe('release');
    for (const pick of out.storylets) {
      expect(pick.pressure).toBeLessThan(0.5);
    }
  });

  it('the faction advances its plan, and the player can be told what it is up to', () => {
    const state = createShowrunner({ seed: 3, informantCoverage: 0.9 });
    const out = run(state);
    expect(out.factionReport.length).toBeGreaterThan(0);
    expect(out.intel.length).toBeGreaterThan(0);
    expect(out.intel[0]).toMatch(/Informant:/);
  });

  it('with no informants there is no intel — coverage is what buys it', () => {
    const state = createShowrunner({ seed: 3, informantCoverage: 0 });
    expect(run(state).intel).toEqual([]);
  });

  it('a burned safehouse is remembered, not un-found next shift', () => {
    const state = createShowrunner({ seed: 3 });
    run(state, { burnedSites: ['printery_b'] });
    expect(state.burnedSites).toContain('printery_b');
    run(state);
    expect(state.burnedSites).toContain('printery_b');
  });
});

describe('the Inspector explains the shift', () => {
  it('always produces rows with no empty explanations', () => {
    const state = createShowrunner({ seed: 11 });
    const out = run(state, { forceCommitted: 2, arrests: 1, recordsFiled: 1 });
    const rows = inspectShift(out);
    expect(rows.length).toBeGreaterThan(4);
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
      // every row either carries a value or a sentence
      expect(row.value.length + row.note.length).toBeGreaterThan(0);
      expect(row.note).not.toMatch(/undefined|NaN/);
    }
  });

  it('names the Desk\'s actual opinion when it has one', () => {
    const state = createShowrunner({ seed: 11 });
    // build a paperwork-neglect habit over a few shifts
    for (let i = 0; i < 4; i++) run(state, { arrests: 2, recordsFiled: 0 });
    const out = run(state, { arrests: 2, recordsFiled: 0 });
    const row = inspectShift(out).find((r) => r.label === 'What the Desk thinks of you');
    expect(row?.value).toBe('paperwork neglect');
    expect(row?.note).toMatch(/files have stopped matching/);
  });

  it('shows the four factors for the top cards, in the order they were used', () => {
    const state = createShowrunner({ seed: 11 });
    const out = run(state);
    const rows = inspectShift(out).filter((r) => r.label.startsWith('Card '));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.note).toMatch(/novelty \d × alignment [\d.]+ × pacing [\d.]+ × temperature [\d.]+/);
    }
  });

  it('reports an empty directive list rather than a blank row', () => {
    const state = createShowrunner({ seed: 11 });
    const out = run(state);
    out.directives = [];
    expect(inspectShift(out).some((r) => r.label === 'Directive')).toBe(false);
  });

  it('renders as pasteable markdown for the G2 protocol', () => {
    const state = createShowrunner({ seed: 11 });
    const md = inspectionMarkdown(run(state));
    expect(md.split('\n')[0]).toBe('### Shift 0 — why this happened');
    expect(md).toMatch(/\*\*District temperature\*\*/);
    expect(md.split('\n').length).toBeGreaterThan(5);
  });
});

describe('people, and the slots they cost', () => {
  it('materialises a citizen you asked about, or nothing at all', () => {
    const state = createShowrunner({ seed: 5 });
    expect(citizenAt(state, 'h-001')?.name).toBeTruthy();
    expect(citizenAt(state, 'h-999')).toBeNull();
  });

  it('meeting someone puts them in the Known set, with a reason', () => {
    const state = createShowrunner({ seed: 5 });
    const met = meet(state, 'h-007', 'named in a filed line');
    expect(met?.agent.household_id).toBe('h-007');
    expect(met?.evicted).toBeNull();
    expect(state.known.all()[0]!.reason).toBe('named in a filed line');
  });

  it('the 13th person pushes someone out, and the caller is told who', () => {
    const state = createShowrunner({ seed: 5 });
    for (let i = 1; i <= 12; i++) meet(state, `h-${String(i).padStart(3, '0')}`, 'r');
    const thirteenth = meet(state, 'h-050', 'someone new');
    expect(thirteenth?.evicted).toBe('h-001');
    expect(state.known.size).toBe(12);
  });

  it('the same person is the same person on Tuesday as on Monday', () => {
    const state = createShowrunner({ seed: 5 });
    const monday = meet(state, 'h-014', 'cleared the flat')!.agent;
    run(state);
    run(state);
    const tuesday = citizenAt(state, 'h-014')!;
    expect(tuesday).toEqual(monday);
  });

  it('the heat map is a claim-level view, with no hidden truth in it', () => {
    const state = createShowrunner({ seed: 5 });
    const rows = householdHeat(state);
    expect(rows).toHaveLength(60);
    for (const row of rows) {
      expect(row.heat).toBeGreaterThanOrEqual(0);
      expect(row.heat).toBeLessThanOrEqual(100);
      expect(row.known).toBe(false);
    }
    expect(householdHeat({ ...state, known: state.known }).length).toBe(60);
  });

  it('a detection raises Oversight, and the gauge cools on its own shift', () => {
    const state = createShowrunner({ seed: 5 });
    reportDetection(state, 'a record contradicted itself', 2);
    expect(state.eye.attention).toBeGreaterThan(0);
    const before = state.eye.attention;
    run(state);
    expect(state.eye.attention).toBeLessThan(before);
  });
});
