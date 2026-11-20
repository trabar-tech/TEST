/**
 * The shift's scenes, and what the Warden did in them (P3-T04, in the browser).
 *
 * The deck runtime was built, tested 27 ways, and then pulled no strings in the running
 * game: twelve authored storylets that no player would ever see. This is the small state
 * object that fixes that — it holds the cards the deck drew for this shift, the ones
 * already played, and the effects those resolutions wrote.
 *
 * Deliberately *not* a view. The rendering lives in `src/ui/scene.ts` and knows nothing
 * about decks; the deck knows nothing about DOM. The seam between them is three fields.
 */

import type { Storylet } from '@core/content';
import { applyResolution, type EffectState } from './storylets';

export interface PlayedScene {
  card: Storylet;
  resolutionId: string;
  /** the effect lines `applyResolution` reported, for the debrief */
  applied: string[];
}

export interface SceneLogState extends EffectState {
  /** the shift this log belongs to */
  shift: number;
  /** cards the deck drew for this shift, in draw order */
  drawn: Storylet[];
  /** the ones the player has already resolved */
  played: PlayedScene[];
  /** archetypes played, newest last, for the deck's novelty window */
  recentArchetypes: string[];
}

export function createSceneLog(shift: number): SceneLogState {
  return { shift, flags: {}, scheduled: [], drawn: [], played: [], recentArchetypes: [] };
}

/** Cards still waiting to be played this shift. */
export function pending(state: SceneLogState): Storylet[] {
  const played = new Set(state.played.map((p) => p.card.id));
  return state.drawn.filter((c) => !played.has(c.id));
}

export function isPlayed(state: SceneLogState, cardId: string): boolean {
  return state.played.some((p) => p.card.id === cardId);
}

export interface ResolveOptions {
  card: Storylet;
  resolutionId: string;
  /** used to place a scheduled epilogue inside its authored window */
  window?: [number, number];
}

/**
 * Play a resolution: write its effects, remember it, and report what changed.
 *
 * Returns null when the card or the resolution does not exist, rather than half-applying
 * — a partial effect is the kind of bug that surfaces three shifts later as a mystery.
 */
export function playResolution(state: SceneLogState, opts: ResolveOptions): PlayedScene | null {
  const resolution = opts.card.resolutions.find((r) => r.id === opts.resolutionId);
  if (!resolution || isPlayed(state, opts.card.id)) return null;

  const applied = applyResolution(state, resolution, {
    shift: state.shift,
    window: opts.window,
    cause: opts.card.id,
  });

  const played: PlayedScene = { card: opts.card, resolutionId: opts.resolutionId, applied };
  state.played.push(played);
  state.recentArchetypes = [...state.recentArchetypes, opts.card.archetype ?? opts.card.deck].slice(-6);
  return played;
}

/**
 * What the Warden's choices *did*, in the terms the district understands.
 *
 * The resolutions carry authored `legitimacy` and `standing` weights. Those are the only
 * numbers the scene layer is allowed to produce: it may not invent facts, and it may not
 * read `truth`. The caller adds them to the district's own bookkeeping.
 */
export function sceneTotals(state: SceneLogState): { legitimacy: number; standing: number; integrity: number; notes: string[] } {
  let legitimacy = 0;
  let standing = 0;
  let integrity = 0;
  const notes: string[] = [];
  for (const played of state.played) {
    const resolution = played.card.resolutions.find((r) => r.id === played.resolutionId);
    if (!resolution) continue;
    legitimacy += resolution.legitimacy;
    standing += resolution.standing;
    integrity += resolution.integrity;
    if (resolution.note) notes.push(resolution.note);
  }
  return { legitimacy, standing, integrity, notes };
}

/**
 * The line a scene leaves on the briefing for *next* shift — the cheap version of "the
 * district noticed". One sentence, written by the resolution, not by a template.
 */
export function closingLine(state: SceneLogState): string | null {
  const last = state.played.at(-1);
  if (!last) return null;
  const resolution = last.card.resolutions.find((r) => r.id === last.resolutionId);
  const label = resolution?.label ?? 'you decided';
  return `${last.card.title}: ${label.toLowerCase()}.`;
}
