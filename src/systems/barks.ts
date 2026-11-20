/**
 * Barks and ambience (P1-T08).
 *
 * There are no audio files. This app is a single page with no network access, so
 * shipping sampled audio would mean embedding megabytes of base64 — and the
 * preview runs in a sandboxed iframe where autoplay is blocked anyway.
 *
 * So the regime is *read*, not heard: lines on a loudspeaker plate, ambient
 * lines as stage directions in a corner of the HUD. It is a deliberate Phase 1
 * compromise, recorded as such in the phase notes, and the script doubles as the
 * recording list if audio is ever added.
 */

import { streamFor, type Rng } from '@core/rng';

export interface BarkSet {
  loudspeaker: string[];
  radio: string[];
  ambient: string[];
  witness: string[];
  /**
   * Lines keyed by the district's temperature grade (P3-T03).
   *
   * This is the whole of the temperature system's *player-facing* payload: the
   * number is never shown, it is heard. A district at `braced` should not be
   * saying the same things as one at `calm`, or the grade is decoration.
   *
   * Optional so a bark file without graded lines still loads — it just keeps
   * reading like a district with one mood, which is a content gap, not a crash.
   */
  by_grade?: Partial<Record<'calm' | 'wary' | 'braced' | 'hostile', string[]>>;
}

export type Grade = 'calm' | 'wary' | 'braced' | 'hostile';

export const DEFAULT_BARK_INTERVAL = 26; // seconds

/**
 * Deterministic ambience: the same shift plays the same street sounds, which
 * matters because "it kept saying that" is one of the ways the game should feel
 * like a place rather than a randomiser.
 */
export class Barks {
  private readonly rng: Rng;
  private readonly used = new Set<string>();
  private nextAt = 0;

  constructor(
    private readonly set: BarkSet,
    seed: number,
    shift: number,
    private readonly interval = DEFAULT_BARK_INTERVAL,
  ) {
    this.rng = streamFor(seed, shift, 'barks');
  }

  /** Next ambient or loudspeaker line, or null if it is not time yet. */
  next(simSeconds: number): { kind: 'loudspeaker' | 'ambient'; text: string } | null {
    if (simSeconds < this.nextAt) return null;
    this.nextAt = simSeconds + this.interval * (0.6 + this.rng.next() * 0.9);
    // a speaker line roughly every third slot: the street is mostly not talking
    const loud = this.rng.chance(0.34);
    const pool = loud ? this.set.loudspeaker : this.set.ambient;
    const text = this.pickUnused(pool) ?? this.pickUnused(this.set.ambient);
    if (!text) return null;
    return { kind: loud ? 'loudspeaker' : 'ambient', text };
  }

  /** A line for the radio, at the start of the shift or after an audit. */
  radio(): string {
    return this.pickUnused(this.set.radio) ?? this.set.radio[0] ?? '';
  }

  /**
   * The street's mood, spoken. Falls back to the plain ambient pool when the
   * bark file has nothing written for this grade, and *remembers* what it has
   * said, so a district at `braced` does not repeat itself into wallpaper.
   */
  forGrade(grade: Grade): string | null {
    const graded = this.set.by_grade?.[grade] ?? [];
    const text = this.pickUnused(graded) ?? this.pickUnused(this.set.ambient);
    if (!text) return null;
    return text;
  }

  /** What a witness says when they are brought in. */
  witnessLine(): string {
    return this.pickUnused(this.set.witness) ?? this.set.witness[0] ?? '';
  }

  private pickUnused(pool: readonly string[]): string | null {
    const fresh = pool.filter((t) => !this.used.has(t));
    if (fresh.length === 0) return null;
    const text = fresh[this.rng.int(0, fresh.length - 1)]!;
    this.used.add(text);
    return text;
  }
}
