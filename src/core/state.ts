/**
 * GameState — the single object that a save contains and a state hash covers.
 *
 * Kept deliberately flat and JSON-safe. If it can't be JSON-stringified, it
 * can't be in here (no Maps, no class instances, no functions).
 *
 * The Record (ReportLine[]) lives here too, even though Phase 1 builds its UI,
 * because ADR-0002 makes the save format depend on its shape.
 */

import type { WorldSnapshot } from './world';
import type { TimeMode } from './clock';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  entityId: number | null;
  /** where the shift's clock is, in sim seconds since 06:00 */
  shiftSeconds: number;
}

export interface TickState {
  tick: number;
  simSeconds: number;
  /**
   * Typed, not `string`: the clock's restore path takes a TimeMode, and a save
   * with an unknown mode should fail at the type level, not fall back to
   * patrol at runtime halfway through a replay.
   */
  mode: TimeMode;
}

export interface GameState {
  /** campaign seed: all randomness derives from this */
  seed: number;
  shift: number;
  /** Warden's rank (1-5). Dictates wage. */
  rank: number;
  /** Warden's current personal economy balance (FP). */
  balance: number;
  tick: TickState;
  player: PlayerState;
  world: WorldSnapshot;
  /** ReportLine[] — filled in Phase 1; present now so the save shape is stable */
  record: unknown[];
  /** narrative + simulation flags */
  flags: Record<string, boolean | number | string>;
  /**
   * RNG stream positions, keyed by system id. A save without these cannot
   * resume a shift exactly, so they are part of the contract (ADR-0001).
   */
  rng: Record<string, number>;
  /** content version this save was made against */
  contentVersion: string;
}

export function emptyState(seed: number): GameState {
  return {
    seed,
    shift: 1,
    rank: 1,
    balance: 0,
    tick: { tick: 0, simSeconds: 0, mode: 'patrol' },
    player: { entityId: null, shiftSeconds: 0 },
    world: { nextId: 1, entities: [] },
    record: [],
    flags: {},
    rng: {},
    contentVersion: '0',
  };
}
