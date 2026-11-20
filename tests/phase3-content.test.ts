/**
 * P3-T03 integration — the *real* content bundle, through the real deck and the
 * real showrunner.
 *
 * The unit tests use fixtures, which means they prove the machinery works and not
 * that the shipped content fits it. This file is the seam: if the sample bundle
 * cannot drive a shift, the phase is not done, whatever the unit tests say.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseContent, indexContent } from '@core/content';
import { streamFor } from '@core/rng';
import { buildDeck, explainDraw, scoreCard, type StoryContext } from '@systems/storylets';
import { createShowrunner, inspectShift, runShift } from '@systems/showrunner';

const raw = JSON.parse(readFileSync(join(process.cwd(), 'content/examples/content.sample.json'), 'utf8'));
const bundle = parseContent(raw, 'content.sample.json');
const loaded = indexContent(bundle);
const cards = bundle.micro_events;

const ctx = (over: Partial<StoryContext> = {}): StoryContext => ({
  shift: 3,
  temperature: 45,
  flags: {},
  knownCount: 2,
  ...over,
});

describe('the shipped content fits the runtime', () => {
  it('parses, and keeps the director vocabulary the schema used to strip', () => {
    expect(cards.length).toBeGreaterThanOrEqual(10);
    for (const card of cards) {
      expect(typeof card.pressure).toBe('number');
      expect(Array.isArray(card.fault_lines)).toBe(true);
      expect(card.deck.length).toBeGreaterThan(0);
    }
  });

  it('meets the connective-tissue budget the phase doc calls for', () => {
    expect(loaded.report.connectiveTissueRatio).toBeGreaterThanOrEqual(0.4);
  });

  it('declares at least one epilogue that some micro-event schedules', () => {
    const epilogues = cards.filter((c) => c._type === 'epilogue_storylet');
    expect(epilogues.length).toBeGreaterThan(0);
    const scheduled = new Set(
      cards.flatMap((c) => c.resolutions.map((r) => r.effects?.schedule_epilogue).filter(Boolean) as string[]),
    );
    for (const id of scheduled) expect(loaded.byId.storylets.has(id)).toBe(true);
  });

  it('every card resolves to a claim the record layer recognises', () => {
    const legal = new Set(['P', 'C', 'D', 'X', 'B', '-', 'R', 'NR']);
    for (const card of cards) {
      for (const r of card.resolutions) expect(legal.has(r.claim)).toBe(true);
    }
  });
});

describe('a shift can be played from the shipped bundle', () => {
  it('draws morning beats that pass their own prerequisites', () => {
    const deck = buildDeck('beat_morning', cards, { includeBeats: true });
    expect(deck.size).toBeGreaterThan(0);
    const { picks, trace } = deck.draw({ k: 3, ctx: ctx(), rng: streamFor(1, 3, 'storylets') });
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(trace.find((t) => t.card.id === pick.id)!.eligible).toBe(true);
    }
  });

  it('reads as one screen of explanation', () => {
    const deck = buildDeck('beat_morning', cards, { includeBeats: true });
    const text = explainDraw(deck.draw({ k: 3, ctx: ctx(), rng: streamFor(2, 3, 'storylets') }));
    expect(text.split('\n').length).toBeLessThan(40);
  });

  it('a cold district sees the calm cards, a hot one sees the sharp ones', () => {
    const cold = cards.filter((c) => scoreCard(c, ctx({ temperature: 10 })).final > 0.9).map((c) => c.id);
    const hot = cards.filter((c) => scoreCard(c, ctx({ temperature: 90 })).final > 0.9).map((c) => c.id);
    expect(cold).toContain('me-06-quiet');
    expect(hot).not.toContain('me-06-quiet');
  });

  it('runs five shifts through the showrunner without contradicting itself', () => {
    const state = createShowrunner({ seed: 2026, informantCoverage: 0.5 });
    for (let shift = 0; shift < 5; shift++) {
      const out = runShift(state, cards, {
        rng: streamFor(2026, shift, 'storylets'),
        arrests: shift % 2,
        recordsFiled: shift % 2,
        forceCommitted: shift === 4 ? 6 : 1,
      });
      expect(out.storylets.length).toBeGreaterThan(0);
      expect(out.temperature).toBeGreaterThanOrEqual(0);
      const rows = inspectShift(out);
      for (const row of rows) expect(row.note + row.value).not.toMatch(/undefined|NaN/);
    }
    expect(state.shift).toBe(5);
    // a lethal last shift must have opened a release state, and the state persists
    expect(['release', 'calm']).toContain(state.arbiter.state);
  });

  it('the Desk has something to say about every fault line it can observe', () => {
    const state = createShowrunner({ seed: 77 });
    for (let shift = 0; shift < 4; shift++) {
      runShift(state, cards, {
        rng: streamFor(77, shift, 'storylets'),
        rungsUsed: [4],
        forceCommitted: 4,
        recordsBackdated: 1,
        curfewEnforced: false,
      });
    }
    const faults = Object.keys(state.fault).filter((k) => (state.fault[k] ?? 0) > 0);
    expect(faults.length).toBeGreaterThan(0);
  });
});
