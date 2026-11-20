// @vitest-environment jsdom
/**
 * P3-T04 — the storylets actually fire.
 *
 * The deck runtime was tested 27 ways and then pulled no strings in the running game.
 * These tests cover the seam where a card becomes something a player does: the draw, the
 * scene, the resolution, and the effect that reaches the district.
 */

import { describe, expect, it, vi } from 'vitest';
import { click } from './helpers';
import { streamFor } from '@core/rng';
import { buildDeck } from '@systems/storylets';
import { createSceneLog, isPlayed, pending, playResolution, sceneTotals, closingLine } from '@systems/scene-log';
import { createScene } from '@ui/scene';
import { parseContent } from '@core/content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cards = parseContent(
  JSON.parse(readFileSync(join(process.cwd(), 'content/examples/content.sample.json'), 'utf8')),
  'content.sample.json',
).micro_events;

const card = (id: string) => cards.find((c) => c.id === id)!;

describe('the shift draws cards and remembers what was played', () => {
  it('starts with nothing drawn or played', () => {
    const log = createSceneLog(3);
    expect(pending(log)).toEqual([]);
    expect(log.shift).toBe(3);
  });

  it('a drawn card is pending until it is played', () => {
    const log = createSceneLog(3);
    log.drawn = [card('me-01-notices'), card('me-06-quiet')];
    expect(pending(log)).toHaveLength(2);
    playResolution(log, { card: card('me-01-notices'), resolutionId: 'me-01-a' });
    expect(pending(log)).toHaveLength(1);
    expect(isPlayed(log, 'me-01-notices')).toBe(true);
  });

  it('refuses to play the same card twice, rather than double-applying its effects', () => {
    const log = createSceneLog(3);
    playResolution(log, { card: card('me-01-notices'), resolutionId: 'me-01-a' });
    expect(playResolution(log, { card: card('me-01-notices'), resolutionId: 'me-01-b' })).toBeNull();
    expect(log.played).toHaveLength(1);
  });

  it('refuses a resolution that is not on the card, and applies nothing', () => {
    const log = createSceneLog(3);
    expect(playResolution(log, { card: card('me-01-notices'), resolutionId: 'nope' })).toBeNull();
    expect(log.flags).toEqual({});
    expect(log.played).toEqual([]);
  });

  it('writes the flag a resolution carries, and reports it in the words the effect used', () => {
    const log = createSceneLog(4);
    const played = playResolution(log, { card: card('me-04-child'), resolutionId: 'me-04-a' })!;
    expect(log.flags.filed_unregistered_child).toBe(true);
    expect(played.applied.join(' ')).toMatch(/flag filed_unregistered_child/);
  });

  it('schedules an epilogue inside its authored window instead of firing it immediately', () => {
    const log = createSceneLog(2);
    const played = playResolution(log, { card: card('me-03-press'), resolutionId: 'me-03-b' })!;
    expect(played.applied.join(' ')).toMatch(/scheduled epi-01-press-moved/);
    expect(log.scheduled).toHaveLength(1);
    expect(log.scheduled[0]!.dueShift).toBeGreaterThan(2);
  });

  it('updates the novelty window so the next shift is not the same card again', () => {
    const log = createSceneLog(3);
    playResolution(log, { card: card('me-01-notices'), resolutionId: 'me-01-a' });
    expect(log.recentArchetypes).toContain('beat_morning');
  });

  it('totals the legitimacy and standing a shift of choices produced', () => {
    const log = createSceneLog(3);
    playResolution(log, { card: card('me-01-notices'), resolutionId: 'me-01-a' });
    playResolution(log, { card: card('me-06-quiet'), resolutionId: 'me-06-a' });
    const totals = sceneTotals(log);
    expect(totals.legitimacy).toBe(1); // me-01-a is +1, me-06-a is 0
    expect(totals.standing).toBe(1); // me-06-a is +1
  });

  it('leaves a closing line the next briefing can carry', () => {
    const log = createSceneLog(3);
    expect(closingLine(log)).toBeNull();
    playResolution(log, { card: card('me-05-witness'), resolutionId: 'me-05-b' });
    expect(closingLine(log)).toBe('Somebody was seen: put the line in the stove.');
  });
});

describe('the deck actually chooses from the shipped content', () => {
  it('draws cards whose prerequisites hold, and none that do not', () => {
    const deck = buildDeck('beat_morning', cards, { includeBeats: true });
    const drawn = deck.draw({
      k: 2,
      ctx: { shift: 3, temperature: 40, flags: {}, knownCount: 0 },
      rng: streamFor(1, 3, 'storylets'),
    });
    expect(drawn.picks.length).toBeGreaterThan(0);
    for (const pick of drawn.picks) {
      expect(drawn.trace.find((t) => t.card.id === pick.id)!.eligible).toBe(true);
    }
  });

  it('a RELEASE shift refuses a sharp card outright, not merely discounts it', () => {
    const deck = buildDeck('beat_morning', cards, { includeBeats: true });
    const drawn = deck.draw({
      k: 5,
      ctx: { shift: 3, temperature: 40, flags: {}, knownCount: 0, pacing: 'release' },
      rng: streamFor(2, 3, 'storylets'),
    });
    for (const pick of drawn.picks) expect(pick.pressure).toBeLessThanOrEqual(0.5);
    const sharp = drawn.trace.find((t) => t.card.pressure > 0.5);
    if (sharp) {
      expect(sharp.eligible).toBe(false);
      expect(sharp.why.join(' ')).toMatch(/too sharp for a release shift/);
    }
  });

  it('a sharp card is still fine on a peak shift, so release is doing the work', () => {
    const deck = buildDeck('beat_morning', cards, { includeBeats: true });
    const drawn = deck.draw({
      k: 5,
      ctx: { shift: 3, temperature: 70, flags: {}, knownCount: 0, pacing: 'peak' },
      rng: streamFor(2, 3, 'storylets'),
    });
    const sharp = drawn.trace.find((t) => t.card.pressure > 0.5);
    if (sharp) expect(sharp.eligible).toBe(true);
  });
});

describe('the scene on screen', () => {
  const mount = (id: string, onResolve = vi.fn()) => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const handle = createScene(host, { card: card(id), onResolve, why: 'they have been asking about patrols' });
    return { host, handle, onResolve };
  };

  it('shows the title and every beat, in order', () => {
    const { host } = mount('me-04-child');
    const text = host.textContent ?? '';
    expect(text).toMatch(/A child with no line/);
    for (const beat of card('me-04-child').beats) expect(text).toContain(beat.text);
  });

  it('offers exactly the resolutions the card authored, and nothing invented', () => {
    const { host } = mount('me-04-child');
    const buttons = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toEqual(card('me-04-child').resolutions.map((r) => r.label));
  });

  it('reports the resolution id when a choice is made, not the label', () => {
    const { host, onResolve } = mount('me-04-child');
    click(host, 'Say nothing');
    expect(onResolve).toHaveBeenCalledWith('me-04-c');
  });

  it('says plainly that the choice still has to be written up', () => {
    const { host } = mount('me-01-notices');
    expect(host.textContent).toMatch(/still has to be written up at the desk/);
    expect(host.textContent).toMatch(/only knows what you file/);
  });

  it('shows no numbers anywhere — a scene is a situation, not a spreadsheet', () => {
    const { host } = mount('me-04-child');
    const text = host.textContent ?? '';
    expect(text).not.toMatch(/\d+\s*(%|points|legitimacy|standing)/i);
  });

  it('carries the why, so the player knows why this is happening now', () => {
    const { host } = mount('me-04-child');
    expect(host.textContent).toMatch(/asking about patrols/);
  });

  it('destroys cleanly', () => {
    const { host, handle } = mount('me-01-notices');
    expect(host.children).toHaveLength(1);
    handle.destroy();
    expect(host.children).toHaveLength(0);
  });
});
