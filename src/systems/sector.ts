/**
 * The sector's memory between shifts.
 *
 * Phase 2 ends with a number that only exists in `main.ts`: `force_index`, the
 * ratchet that makes "suppression breeds resistance" literally true. That is a
 * save-format bug waiting to happen — the whole design claim of the tactical
 * layer dies if a page reload forgets it.
 *
 * So it lives here: one small, JSON-safe record on `GameState.flags`, updated by
 * exactly two functions (`recordForce`, `nextShift`), decayed once per shift, and
 * covered by a test that round-trips it through a real save.
 *
 * Deliberately *not* a class over the state. The state stays a plain object
 * (ADR-0002: if it can't be JSON-stringified it can't be saved), and the rules
 * stay pure functions so they can be table-tested.
 */

import type { GameState } from '@core/state';
import {
  decayForceIndex,
  pressureFromIndex,
  startingMood,
  startingRung,
  type ForceIndex,
} from './tactical/force';
import type { ForceRung } from './tactical/types';

/** The flag keys. Namespaced because `flags` is shared with narrative state. */
const SECTOR_KEY = 'sector';
const FORCE_KEY = 'sector.force';
const SHIFTS_KEY = 'sector.shifts';

export interface SectorMemory {
  sector: string;
  /** accumulated and decayed force, in the ratchet's own units */
  force: number;
  /** how many shifts this sector has been policed for, 0-based */
  shifts: number;
}

const DEFAULT: SectorMemory = { sector: 'kiln_row', force: 0, shifts: 0 };

/**
 * Read the sector out of a game state. Tolerant on purpose: a save from before
 * this existed has no flags, and a save is never broken by *reading* it.
 */
export function readSector(state: GameState): SectorMemory {
  const raw = state.flags;
  return {
    sector: typeof raw[SECTOR_KEY] === 'string' ? (raw[SECTOR_KEY] as string) : DEFAULT.sector,
    force: typeof raw[FORCE_KEY] === 'number' ? (raw[FORCE_KEY] as number) : DEFAULT.force,
    shifts: typeof raw[SHIFTS_KEY] === 'number' ? (raw[SHIFTS_KEY] as number) : DEFAULT.shifts,
  };
}

/** Write it back, in place: `flags` is part of the save, not a cache. */
export function writeSector(state: GameState, memory: SectorMemory): void {
  state.flags[SECTOR_KEY] = memory.sector;
  state.flags[FORCE_KEY] = round(memory.force);
  state.flags[SHIFTS_KEY] = memory.shifts;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** What the scene reads: the index in the shape `force.ts` wants. */
export function forceIndexOf(state: GameState): ForceIndex {
  const m = readSector(state);
  return { sector: m.sector, value: m.force };
}

/**
 * Add the weight of one incident. Returns the new memory so callers can announce
 * it; the state is updated as a side effect because it *is* the save.
 */
export function recordForce(state: GameState, weight: number): SectorMemory {
  const m = readSector(state);
  const next = { ...m, force: round(m.force + weight) };
  writeSector(state, next);
  return next;
}

/**
 * The shift boundary: decay 15%, count the shift, and hand back the starting
 * conditions tonight's incidents should use. This is the only place the ratchet
 * moves on its own, which is what makes it a ratchet rather than a leak.
 */
export function nextShift(
  state: GameState,
  opts: { decay?: boolean } = {},
): { memory: SectorMemory; rung: ForceRung; mood: { compliance: number; aggression: number } } {
  const m = readSector(state);
  const decayed: ForceIndex =
    opts.decay === false
      ? { sector: m.sector, value: m.force }
      : decayForceIndex({ sector: m.sector, value: m.force });
  const next = { ...m, force: round(decayed.value), shifts: m.shifts + 1 };
  writeSector(state, next);
  const index: ForceIndex = { sector: next.sector, value: next.force };
  return { memory: next, rung: startingRung(index), mood: startingMood(index) };
}

/** Human-readable, for the debrief and the between-shift summary. */
export function describeSector(memory: SectorMemory): string {
  const p = pressureFromIndex({ sector: memory.sector, value: memory.force });
  const word = p > 0.75 ? 'hostile' : p > 0.4 ? 'braced' : p > 0.15 ? 'wary' : 'quiet';
  return `${memory.sector.replace(/_/g, ' ')} is ${word} after ${memory.shifts} shift${memory.shifts === 1 ? '' : 's'}`;
}

/** The report line for the case file / debug overlay. */
export function sectorFacts(state: GameState): string[] {
  const m = readSector(state);
  return [
    `force index ${m.force.toFixed(2)}`,
    `shifts policed ${m.shifts}`,
    describeSector(m),
  ];
}
