/**
 * Deterministic RNG.
 *
 * ADR-0001: `Math.random` is banned outside this file (enforced by
 * `scripts/check-boundaries.mjs`). Every random draw in the game comes from a
 * stream derived from (campaignSeed, shift, systemId) so that a shift can be
 * replayed exactly — which the audit tests, the save format and OVERSEER's
 * headless dispatch all depend on.
 */

/** 32-bit FNV-1a over a string. Stable across JS engines. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix two 32-bit values into a new 32-bit value. */
export function mix32(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  /** uint32 in [0, 2^32) */
  nextU32(): number;
  /** float in [0, 1) */
  next(): number;
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number;
  /** true with probability p */
  chance(p: number): boolean;
  /** uniform pick; returns undefined only for an empty list */
  pick<T>(items: readonly T[]): T | undefined;
  /** weighted pick; weights must be > 0 */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined;
  /** current internal state, for save/replay */
  state(): number;
  /**
   * Restore internal state from a save. A save must carry every stream's
   * position, otherwise reloading mid-shift re-rolls draws and the shift is no
   * longer reproducible (P0-T04 acceptance).
   */
  restore(state: number): void;
}

/**
 * mulberry32 — small, fast, and good enough for game content. Deterministic
 * given a seed, and its whole state is one uint32, which makes it trivial to
 * serialise into a save.
 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;

  const nextU32 = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  const rng: Rng = {
    nextU32,
    next: () => nextU32() / 0x100000000,
    int(min, max) {
      if (max < min) throw new Error(`rng.int: max < min (${max} < ${min})`);
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    chance: (p) => rng.next() < p,
    pick: (items) => (items.length === 0 ? undefined : items[rng.int(0, items.length - 1)]),
    weighted(items, weight) {
      if (items.length === 0) return undefined;
      let total = 0;
      for (const item of items) total += Math.max(0, weight(item));
      if (total <= 0) return items[0];
      let roll = rng.next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll <= 0) return item;
      }
      return items[items.length - 1];
    },
    state: () => a,
    restore(next: number) {
      a = next >>> 0;
    },
  };
  return rng;
}

/**
 * The only sanctioned way to obtain randomness: a stream keyed by
 * (campaign seed, shift, system id). Two systems never share a stream, so
 * adding a system can never shift another system's draws.
 */
export function streamFor(campaignSeed: number, shift: number, systemId: string): Rng {
  const seed = mix32(mix32(campaignSeed >>> 0, shift >>> 0), hashString(systemId));
  return makeRng(seed);
}
