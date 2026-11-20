/**
 * P3-T04 — the spine. Everything a director does in this game is a deck draw, so
 * the runtime's two non-negotiables are tested first and hardest:
 *
 *   1. the same seed draws the same cards, and
 *   2. every draw can be explained in one screen, *including* the cards that were
 *      excluded and why.
 */

import { describe, expect, it } from 'vitest';
import { streamFor } from '@core/rng';
import {
  Deck,
  applyResolution,
  buildDeck,
  dueEpilogues,
  evaluateRequires,
  explainDraw,
  faultAlignment,
  scoreCard,
  storyletRng,
  type EffectState,
  type StoryContext,
} from '@systems/storylets';
import type { Storylet } from '@core/content';

/** Test cards may carry fields the schema does not yet name (pressure, band, faults). */
const card = (over: { id: string } & Record<string, unknown>): Storylet =>
  ({
    title: over.id,
    requires: {},
    references: [],
    deck: 'beat_morning',
    pressure: 0.5,
    fault_lines: [],
    weight: { base: 1, connective_bonus: 0 },
    beats: [{ text: 'something happens' }],
    resolutions: [
      { id: 'a', label: 'A', claim: 'P', legitimacy: 0, standing: 0, integrity: 0, time: 0 },
      { id: 'b', label: 'B', claim: 'D', legitimacy: 0, standing: 0, integrity: 0, time: 0 },
    ],
    ...over,
  }) as unknown as Storylet;

const ctx = (over: Partial<StoryContext> = {}): StoryContext => ({
  shift: 3,
  temperature: 40,
  flags: {},
  knownCount: 4,
  ...over,
});

describe('prerequisites', () => {
  it('accepts a card with no requirements', () => {
    expect(evaluateRequires({}, ctx())).toEqual({ ok: true, failures: [] });
  });

  it('bounds temperature inclusively', () => {
    const requires = { temperature: [30, 50] as [number, number] };
    expect(evaluateRequires(requires, ctx({ temperature: 30 })).ok).toBe(true);
    expect(evaluateRequires(requires, ctx({ temperature: 50 })).ok).toBe(true);
    expect(evaluateRequires(requires, ctx({ temperature: 51 })).ok).toBe(false);
  });

  it('says which clause failed, in the card\'s own terms', () => {
    const result = evaluateRequires(
      { flags_any: ['burned_safehouse', 'arrested_recruit'], known_set_has_room: true },
      ctx({ knownCount: 12 }),
    );
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toMatch(/none of flags/);
    expect(result.failures.join(' ')).toMatch(/Known set is full \(12\/12\)/);
  });

  it('treats a false/zero/empty flag as unset', () => {
    expect(evaluateRequires({ flags_any: ['x'] }, ctx({ flags: { x: false } })).ok).toBe(false);
    expect(evaluateRequires({ flags_any: ['x'] }, ctx({ flags: { x: 0 } })).ok).toBe(false);
    expect(evaluateRequires({ flags_any: ['x'] }, ctx({ flags: { x: 1 } })).ok).toBe(true);
  });

  it('refuses an epilogue that has no cause to point at', () => {
    const result = evaluateRequires({ shift_since_cause: [2, 5] }, ctx());
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatch(/needs a cause/);
  });

  it('checks the shift window both ways', () => {
    expect(evaluateRequires({ shift_min: 4 }, ctx({ shift: 3 })).ok).toBe(false);
    expect(evaluateRequires({ shift_max: 2 }, ctx({ shift: 3 })).ok).toBe(false);
  });
});

describe('scoring has four factors and a floor', () => {
  it('never returns zero for an eligible card, however unlikely', () => {
    const unlikely = card({ id: 'odd', temperature_band: [80, 100] });
    const breakdown = scoreCard(unlikely, ctx({ temperature: 0, pacing: 'peak' }));
    expect(breakdown.eligible).toBe(true);
    expect(breakdown.final).toBeGreaterThanOrEqual(0.15);
  });

  it('zeroes novelty when the archetype was seen inside the window', () => {
    const c = card({ id: 'a', deck: 'beat_morning' });
    const seen = scoreCard(c, ctx({ recentArchetypes: ['beat_morning'] }));
    expect(seen.novelty).toBe(0);
    // and the floor still keeps it in the deck, at the floor
    expect(seen.final).toBeCloseTo(0.85, 5);
  });

  it('a novelty window older than 3 shifts does not block a card', () => {
    const c = card({ id: 'a' });
    // oldest first: the archetype sits 4 shifts back, outside the window
    const breakdown = scoreCard(c, ctx({ recentArchetypes: ['beat_morning', 'x', 'y', 'z'] }));
    expect(breakdown.novelty).toBe(1);
  });

  it('alignment uses the strongest fault line, not the sum', () => {
    const c = card({ id: 'a', references: ['brutality', 'honesty', 'family_pressure'] });
    const vector = { brutality: 1, honesty: 0, family_pressure: 0 };
    expect(faultAlignment(c, vector)).toBe(1);
    expect(faultAlignment(c, {})).toBe(0.5);
    expect(faultAlignment(c, undefined)).toBe(0.5);
  });

  it('pacing prefers quiet at calm and pressure at peak', () => {
    const quiet = card({ id: 'q', pressure: 0.1 });
    const sharp = card({ id: 's', pressure: 0.9 });
    expect(scoreCard(quiet, ctx({ pacing: 'calm' })).pacing).toBeGreaterThan(
      scoreCard(sharp, ctx({ pacing: 'calm' })).pacing,
    );
    expect(scoreCard(sharp, ctx({ pacing: 'peak' })).pacing).toBeGreaterThan(
      scoreCard(quiet, ctx({ pacing: 'peak' })).pacing,
    );
  });

  it('release refuses sharp content, which is what release is for', () => {
    const sharp = card({ id: 's', pressure: 0.9 });
    expect(scoreCard(sharp, ctx({ pacing: 'release' })).pacing).toBeLessThan(0.2);
  });

  it('temperature band fades rather than cutting, so content is not lost', () => {
    const c = card({ id: 'a', temperature_band: [60, 80] });
    const near = scoreCard(c, ctx({ temperature: 55 })).temperature;
    const far = scoreCard(c, ctx({ temperature: 0 })).temperature;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0.15);
  });

  it('an ineligible card scores exactly zero and names the reason', () => {
    const c = card({ id: 'a', requires: { shift_min: 9 } });
    const breakdown = scoreCard(c, ctx({ shift: 1 }));
    expect(breakdown.eligible).toBe(false);
    expect(breakdown.final).toBe(0);
    expect(breakdown.why[0]).toMatch(/before shift_min 9/);
  });
});

describe('the deck', () => {
  const cards = [
    card({ id: 'm1' }),
    card({ id: 'm2' }),
    card({ id: 'm3' }),
    card({ id: 'n1', requires: { shift_min: 9 } }),
  ];

  it('draws k cards, never the same one twice', () => {
    const deck = buildDeck('beat_morning', cards);
    const { picks } = deck.draw({ k: 3, ctx: ctx(), rng: storyletRng(1, 3) });
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.id)).size).toBe(3);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const deck = buildDeck('beat_morning', cards);
    const a = deck.draw({ k: 2, ctx: ctx(), rng: storyletRng(7, 3) }).picks.map((p) => p.id);
    const b = deck.draw({ k: 2, ctx: ctx(), rng: storyletRng(7, 3) }).picks.map((p) => p.id);
    expect(a).toEqual(b);

    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const picks = deck.draw({ k: 1, ctx: ctx(), rng: storyletRng(seed, 3) }).picks;
      seen.add(picks[0]!.id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('excludes cards already played this shift, and says so in the trace', () => {
    const deck = buildDeck('beat_morning', cards);
    const { picks, trace } = deck.draw({
      k: 3,
      ctx: ctx(),
      rng: storyletRng(1, 3),
      played: new Set(['m2']),
    });
    expect(picks.map((p) => p.id)).not.toContain('m2');
    const entry = trace.find((t) => t.card.id === 'm2')!;
    expect(entry.eligible).toBe(false);
    expect(entry.why.join(' ')).toMatch(/already played/);
  });

  it('a deck of one still schedules it: a deck of one is a schedule', () => {
    const deck = buildDeck('beat_morning', [card({ id: 'only' })]);
    expect(deck.draw({ k: 3, ctx: ctx(), rng: storyletRng(1, 3) }).picks.map((p) => p.id)).toEqual(['only']);
  });

  it('an empty deck draws nothing instead of throwing', () => {
    const deck = new Deck('empty');
    const result = deck.draw({ k: 3, ctx: ctx(), rng: storyletRng(1, 1) });
    expect(result.picks).toEqual([]);
    expect(result.trace).toEqual([]);
  });

  it('a card in another deck is not in this one, unless beats are included', () => {
    const mix = [card({ id: 'beat' }), card({ id: 'night', deck: 'beat_night' }), card({ id: 'other', deck: 'desk' })];
    expect(buildDeck('beat_morning', mix).all().map((c) => c.id)).toEqual(['beat']);
    expect(buildDeck('beat_morning', mix, { includeBeats: true }).all().map((c) => c.id)).toEqual([
      'beat',
      'night',
    ]);
  });

  it('explains a draw in one screen, marking picks, eligible and excluded', () => {
    const deck = buildDeck('beat_morning', cards);
    const result = deck.draw({ k: 2, ctx: ctx(), rng: storyletRng(2, 3) });
    const text = explainDraw(result);
    expect(text.split('\n').length).toBeLessThan(20);
    expect(text).toMatch(/→ m\d/);
    expect(text).toMatch(/× n1/);
    expect(text).toMatch(/before shift_min 9/);
  });
});

describe('effects and epilogues', () => {
  const state = (): EffectState => ({ flags: {}, scheduled: [] });

  it('sets a flag', () => {
    const s = state();
    applyResolution(s, { effects: { set_flag: 'burned_safehouse' } }, { shift: 2, cause: 'c' });
    expect(s.flags.burned_safehouse).toBe(true);
  });

  it('schedules an epilogue inside the 3–6 shift window', () => {
    const s = state();
    const applied = applyResolution(
      s,
      { effects: { schedule_epilogue: 'epi_silenced_witness' } },
      { shift: 2, cause: 'r-1-01' },
    );
    expect(s.scheduled[0]!.dueShift).toBe(5);
    expect(applied.join(' ')).toMatch(/window 3–6/);
  });

  it('honours a custom window and reports it', () => {
    const s = state();
    applyResolution(
      s,
      { effects: { schedule_epilogue: 'epi_x' } },
      { shift: 4, cause: 'c', window: [1, 2] },
    );
    expect(s.scheduled[0]!.dueShift).toBe(5);
  });

  it('comes due on its shift, not before', () => {
    const s = state();
    applyResolution(s, { effects: { schedule_epilogue: 'epi' } }, { shift: 2, cause: 'c' });
    expect(dueEpilogues(s, 4)).toHaveLength(0);
    expect(dueEpilogues(s, 5)).toHaveLength(1);
    expect(dueEpilogues(s, 9)).toHaveLength(1);
  });

  it('a resolution with no effects changes nothing', () => {
    const s = state();
    expect(applyResolution(s, {}, { shift: 1, cause: 'c' })).toEqual([]);
    expect(s).toEqual({ flags: {}, scheduled: [] });
  });
});

describe('determinism across a whole shift', () => {
  it('two runs of the same deck, seed and shift agree exactly', () => {
    const cards = Array.from({ length: 9 }, (_, i) =>
      card({ id: `c${i}`, references: ['brutality'], deck: 'desk' }),
    );
    const run = () => {
      const rng = streamFor(99, 4, 'storylets');
      const deck = buildDeck('desk', cards);
      return deck.draw({ k: 3, ctx: ctx({ shift: 4, faultVector: { brutality: 0.8 } }), rng });
    };
    const a = run();
    const b = run();
    expect(a.picks.map((p) => p.id)).toEqual(b.picks.map((p) => p.id));
    expect(a.trace.map((t) => t.final)).toEqual(b.trace.map((t) => t.final));
  });
});
