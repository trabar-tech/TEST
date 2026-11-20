/**
 * The storylet runtime (SYS-STORY-01, P3-T04).
 *
 * This is the spine the phase doc warns about: directors, micro-events,
 * directives, family scenes and epilogues are *all* decks (`ADR-0004`). If this
 * file is wrong, five other systems are wrong, so it is deliberately the smallest
 * thing that can be right:
 *
 *   a card = prerequisites + weight + beats + resolutions
 *   a deck = the cards whose prerequisites hold
 *   a draw = a weighted sample, scored by *who is asking*
 *
 * Two rules it does not compromise on:
 *
 *  1. **Determinism.** Same seed, same shift, same deck, same draw. A director
 *     that cannot be replayed cannot be debugged, and a save that cannot be
 *     replayed is a bug report nobody can act on.
 *  2. **Explainability.** `trace()` returns *why* each card scored what it did,
 *     including why a card was excluded. Every director decision has to be
 *     answerable in one screen — that is an exit criterion, not a nicety.
 */

import type { Rng } from '@core/rng';
import { streamFor } from '@core/rng';
import type { Storylet } from '@core/content';

/* ------------------------------------------------------------- predicates */

export interface StoryContext {
  shift: number;
  /** 0–100 */
  temperature: number;
  flags: Record<string, boolean | number | string>;
  /** how many people the Warden can recall by name (cap 12) */
  knownCount: number;
  /** shifts since the cause of this card's chain, if it has one */
  shiftSinceCause?: number;
  /** archetypes seen in the last `NOVELTY_WINDOW` shifts */
  recentArchetypes?: readonly string[];
  /** the Arbiter's pacing state, for pacing_fit */
  pacing?: 'calm' | 'build' | 'peak' | 'release';
  /** the player's fault vector, for alignment */
  faultVector?: Readonly<Record<string, number>>;
}

export const KNOWN_CAP = 12;
export const NOVELTY_WINDOW = 3;

export interface PredicateResult {
  ok: boolean;
  /** one line per failed clause, in the card's own terms */
  failures: string[];
}

/**
 * Evaluate a card's prerequisites. Returns *which* clauses failed, because
 * "the card didn't show up" is the least debuggable sentence in game development.
 */
export function evaluateRequires(
  requires: Storylet['requires'],
  ctx: StoryContext,
): PredicateResult {
  const failures: string[] = [];
  const r = requires;

  if (r.temperature) {
    const [lo, hi] = r.temperature;
    if (ctx.temperature < lo || ctx.temperature > hi) {
      failures.push(`temperature ${ctx.temperature} outside [${lo}, ${hi}]`);
    }
  }
  if (r.shift_min !== undefined && ctx.shift < r.shift_min) {
    failures.push(`shift ${ctx.shift} is before shift_min ${r.shift_min}`);
  }
  if (r.shift_max !== undefined && ctx.shift > r.shift_max) {
    failures.push(`shift ${ctx.shift} is after shift_max ${r.shift_max}`);
  }
  if (r.shift_since_cause) {
    const [lo, hi] = r.shift_since_cause;
    const since = ctx.shiftSinceCause;
    if (since === undefined) failures.push('card needs a cause but none was scheduled');
    else if (since < lo || since > hi) failures.push(`${since} shifts since cause, needs [${lo}, ${hi}]`);
  }
  if (r.flags_any && r.flags_any.length > 0) {
    const hit = r.flags_any.filter((f) => truthy(ctx.flags[f]));
    if (hit.length === 0) failures.push(`none of flags [${r.flags_any.join(', ')}] are set`);
  }
  if (r.flags_none && r.flags_none.length > 0) {
    const hit = r.flags_none.filter((f) => truthy(ctx.flags[f]));
    if (hit.length > 0) failures.push(`flag ${hit[0]} is set and this card requires otherwise`);
  }
  if (r.known_set_has_room === true && ctx.knownCount >= KNOWN_CAP) {
    failures.push(`the Known set is full (${ctx.knownCount}/${KNOWN_CAP})`);
  }
  return { ok: failures.length === 0, failures };
}

function truthy(v: unknown): boolean {
  return v !== undefined && v !== false && v !== 0 && v !== '';
}

/* ----------------------------------------------------------------- scoring */

export interface ScoreBreakdown {
  card: Storylet;
  /** every factor, so one screen can explain the draw */
  novelty: number;
  alignment: number;
  pacing: number;
  temperature: number;
  /** the product with the 0.15 floor applied */
  final: number;
  eligible: boolean;
  why: string[];
}

/**
 * The Desk's scoring product (SYS-DIR-01 §6.1): four factors, one floor.
 *
 * `novelty × alignment × pacing × temperature × 0.15 + 0.85`
 *
 * The floor is the important part: a card is never *impossible*, only unlikely.
 * Without it, a player who plays one way for ten shifts stops being surprised,
 * and surprise is the only thing a director actually sells.
 */
export function scoreCard(card: Storylet, ctx: StoryContext): ScoreBreakdown {
  const why: string[] = [];
  const gate = evaluateRequires(card.requires, ctx);
  if (!gate.ok) {
    return {
      card,
      novelty: 0,
      alignment: 0,
      pacing: 0,
      temperature: 0,
      final: 0,
      eligible: false,
      why: gate.failures,
    };
  }

  const archetype = card.archetype ?? card.deck;
  const novelty =
    ctx.recentArchetypes?.slice(-NOVELTY_WINDOW).includes(archetype) === true ? 0 : 1;
  if (novelty === 0) why.push(`archetype "${archetype}" appeared in the last ${NOVELTY_WINDOW} shifts`);

  const alignment = faultAlignment(card, ctx.faultVector);
  if (alignment > 0.6) why.push(`probes a fault line you lean on (${alignment.toFixed(2)})`);

  const pacing = pacingFit(card, ctx.pacing);
  if (pacing !== 1) why.push(`pacing fit ${pacing.toFixed(2)} for a ${ctx.pacing ?? 'unknown'} shift`);

  const temperature = temperatureFit(card, ctx.temperature);
  if (temperature !== 1) why.push(`temperature fit ${temperature.toFixed(2)} at ${ctx.temperature}`);

  const product = novelty * alignment * pacing * temperature;
  const final = product * 0.15 + 0.85;
  return { card, novelty, alignment, pacing, temperature, final, eligible: true, why };
}

/**
 * How much a card probes the player's *actual* behaviour. Uses the maximum
 * component rather than the dot product, because a card tagged `brutality` should
 * be strongly attractive to a brutal player even if every other axis is zero —
 * and because a dot product over a sparse tag list mostly measures sparsity.
 */
export function faultAlignment(
  card: Storylet,
  vector: Readonly<Record<string, number>> | undefined,
): number {
  if (!vector) return 0.5;
  const all = [...new Set([...card.fault_lines, ...card.references])];
  if (all.length === 0) return 0.5;
  let best = 0;
  for (const tag of all) best = Math.max(best, vector[tag] ?? 0);
  // 0 → 0.5 (still possible), 1 → 1
  return Math.min(1, 0.5 + best * 0.5);
}

/** Calm wants quiet, peak wants pressure, release wants nothing sharp. */
function pacingFit(card: Storylet, pacing: StoryContext['pacing']): number {
  const heat = card.pressure;
  switch (pacing) {
    case 'calm':
      return 1 - heat * 0.8;
    case 'build':
      return 0.6 + heat * 0.4;
    case 'peak':
      return 0.4 + heat * 0.6;
    case 'release':
      return heat > 0.5 ? 0.15 : 1;
    default:
      return 1;
  }
}

/** Cards declare the temperature band they were written for; outside it they fade. */
function temperatureFit(card: Storylet, temperature: number): number {
  const band = card.temperature_band;
  if (!band) return 1;
  const [lo, hi] = band;
  if (temperature >= lo && temperature <= hi) return 1;
  const distance = temperature < lo ? lo - temperature : temperature - hi;
  return Math.max(0.15, 1 - distance / 40);
}

/* -------------------------------------------------------------- the deck */

export interface DrawResult {
  /** the cards the deck chose, in the order they were chosen */
  picks: Storylet[];
  /** every eligible card with its factors — the `--trace` payload */
  trace: ScoreBreakdown[];
}

export interface DrawOptions {
  k: number;
  ctx: StoryContext;
  rng: Rng;
  /** exclude cards already played this shift */
  played?: ReadonlySet<string>;
}

export class Deck {
  private readonly byId = new Map<string, Storylet>();

  constructor(readonly name: string, cards: readonly Storylet[] = []) {
    for (const c of cards) this.byId.set(c.id, c);
  }

  add(card: Storylet): void {
    this.byId.set(card.id, card);
  }

  get size(): number {
    return this.byId.size;
  }

  all(): Storylet[] {
    return [...this.byId.values()];
  }

  get(id: string): Storylet | undefined {
    return this.byId.get(id);
  }

  /** Every card, scored. Nothing is filtered out of the trace: exclusions matter. */
  trace(ctx: StoryContext, played?: ReadonlySet<string>): ScoreBreakdown[] {
    return [...this.byId.values()].map((card) => {
      const breakdown = scoreCard(card, ctx);
      if (played?.has(card.id)) {
        return { ...breakdown, eligible: false, final: 0, why: [...breakdown.why, 'already played this shift'] };
      }
      return breakdown;
    });
  }

  /** Weighted sample without replacement. Deterministic for a given rng. */
  draw(opts: DrawOptions): DrawResult {
    const trace = this.trace(opts.ctx, opts.played);
    const pool = trace.filter((t) => t.eligible && t.final > 0);
    const picks: Storylet[] = [];

    while (picks.length < opts.k && pool.length > 0) {
      const total = pool.reduce((a, t) => a + t.final, 0);
      if (total <= 0) break;
      let roll = opts.rng.next() * total;
      let index = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i]!.final;
        if (roll <= 0) {
          index = i;
          break;
        }
      }
      picks.push(pool[index]!.card);
      pool.splice(index, 1);
    }
    // a deck of one is a schedule: it always plays
    return { picks, trace };
  }
}

/**
 * Build the shift's deck from a content bundle. Cards whose deck name matches —
 * or `beat_*` cards, which belong to whichever beat is running.
 */
export function buildDeck(
  name: string,
  cards: readonly Storylet[],
  opts: { includeBeats?: boolean } = {},
): Deck {
  const deck = new Deck(name);
  for (const card of cards) {
    if (card.deck === name) deck.add(card);
    else if (opts.includeBeats && card.deck.startsWith('beat_')) deck.add(card);
  }
  return deck;
}

/** A seeded stream for the storylet draw: same inputs, same cards. */
export function storyletRng(seed: number, shift: number): Rng {
  return streamFor(seed, shift, 'storylets');
}

/* --------------------------------------------------------------- effects */

export interface EffectState {
  flags: Record<string, boolean | number | string>;
  /** scheduled callbacks: card id → the shift it comes due */
  scheduled: Array<{ id: string; dueShift: number; cause: string }>;
}

/**
 * Apply a resolution's effects. Deliberately tiny: flags and one scheduled
 * epilogue. Anything more and content starts writing code, which is how a data
 * pipeline becomes a scripting language nobody documented.
 */
export function applyResolution(
  state: EffectState,
  resolution: { effects?: { set_flag?: string; schedule_epilogue?: string } },
  opts: { shift: number; window?: [number, number]; cause: string },
): string[] {
  const applied: string[] = [];
  const fx = resolution.effects;
  if (!fx) return applied;

  if (fx.set_flag) {
    state.flags[fx.set_flag] = true;
    applied.push(`flag ${fx.set_flag}`);
  }
  if (fx.schedule_epilogue) {
    const [lo, hi] = opts.window ?? [3, 6];
    // the window is content, but the *choice inside it* is seeded by the caller
    const due = opts.shift + lo;
    state.scheduled.push({ id: fx.schedule_epilogue, dueShift: due, cause: opts.cause });
    applied.push(`scheduled ${fx.schedule_epilogue} for shift ${due} (window ${lo}–${hi})`);
  }
  return applied;
}

/** Which scheduled cards come due this shift, and are not yet played. */
export function dueEpilogues(
  state: EffectState,
  shift: number,
): Array<{ id: string; dueShift: number; cause: string }> {
  return state.scheduled.filter((s) => s.dueShift <= shift);
}

/** One-screen explanation of a draw, for `--trace` and the debug overlay. */
export function explainDraw(result: DrawResult): string {
  const picked = new Set(result.picks.map((p) => p.id));
  const lines: string[] = [];
  for (const t of result.trace.sort((a, b) => b.final - a.final)) {
    const mark = picked.has(t.card.id) ? '→' : t.eligible ? ' ' : '×';
    lines.push(
      `${mark} ${t.card.id.padEnd(22)} ${t.final.toFixed(3)}  ` +
        `novelty ${t.novelty} · align ${t.alignment.toFixed(2)} · pace ${t.pacing.toFixed(2)} · temp ${t.temperature.toFixed(2)}` +
        (t.why.length > 0 ? `\n      ${t.why.join('; ')}` : ''),
    );
  }
  return lines.join('\n');
}
