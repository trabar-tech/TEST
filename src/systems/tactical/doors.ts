/**
 * Doors, entry methods and noise (P2-T01).
 *
 * The door is the tactical design in miniature: **quiet is slow, fast is loud,
 * loud is paperwork.** So every entry method carries four numbers — time, noise
 * radius, officer risk and damage — and those numbers are the *only* things that
 * differ between a clever player and a careless one. Nothing here is a minigame.
 *
 * Noise is propagated through walls, not by radius alone, because a report that
 * says "a neighbour heard the ram" has to be *derivable* from the log. If the
 * audit can't prove it, the player is being punished by magic (SYS-TACT-01 §8.4).
 */

import type { TileMap, Vec2 } from '@core/nav';
import type { DoorDef, DoorState, NoiseEvent, NoiseSource } from './types';

export type EntryMethod =
  | 'knock_talk'
  | 'stack_enter'
  | 'split_entry'
  | 'roof_window'
  | 'ram'
  | 'shotgun'
  | 'gas_wait'
  | 'shout_out';

export interface EntrySpec {
  id: EntryMethod;
  label: string;
  /** sim-seconds to complete */
  time: number;
  /** how far it carries, in tiles */
  noiseRadius: number;
  /** how many walls it penetrates at all */
  noiseWalls: number;
  /** 0–1 chance the occupant gets a shot off first */
  officerRisk: number;
  /** damage to the door, 0–3, which is also the report `damage` field */
  damage: number;
  /** legitimacy delta; the catalogue's actual strategy column */
  legitimacy: number;
  /** which door states this method can beat */
  opens: DoorState[];
  /** can only be used with this many officers */
  minOfficers: number;
  /** reaches rooms with no interior access */
  bypassesDoor?: boolean;
}

/**
 * The catalogue from SYS-TACT-01 §4.2, as data. Ordered from quietest to
 * loudest, which is also roughly cheapest-to-most-expensive in paperwork.
 */
export const ENTRY_METHODS: readonly EntrySpec[] = [
  {
    id: 'knock_talk',
    label: 'Knock & talk',
    time: 30,
    noiseRadius: 2,
    noiseWalls: 0,
    officerRisk: 0.05,
    damage: 0,
    legitimacy: 0,
    opens: ['closed', 'locked', 'ajar'],
    minOfficers: 1,
  },
  {
    id: 'roof_window',
    label: 'Roof / window',
    time: 12,
    noiseRadius: 3,
    noiseWalls: 1,
    officerRisk: 0.4,
    damage: 1,
    legitimacy: 0,
    opens: ['closed', 'locked', 'barred', 'ajar', 'open'],
    minOfficers: 1,
    bypassesDoor: true,
  },
  {
    id: 'shout_out',
    label: 'Shout out',
    time: 15,
    noiseRadius: 4,
    noiseWalls: 1,
    officerRisk: 0.15,
    damage: 0,
    legitimacy: 0,
    opens: ['closed', 'locked', 'ajar'],
    minOfficers: 1,
  },
  {
    id: 'stack_enter',
    label: 'Stack & enter',
    time: 4,
    noiseRadius: 5,
    noiseWalls: 1,
    officerRisk: 0.3,
    damage: 0,
    legitimacy: 1,
    opens: ['closed', 'ajar', 'open'],
    minOfficers: 2,
  },
  {
    id: 'gas_wait',
    label: 'Gas & wait',
    time: 60,
    noiseRadius: 6,
    noiseWalls: 2,
    officerRisk: 0.02,
    damage: 0,
    legitimacy: 3,
    opens: ['closed', 'locked', 'ajar', 'barred'],
    minOfficers: 2,
  },
  {
    id: 'split_entry',
    label: 'Split entry',
    time: 6,
    noiseRadius: 7,
    noiseWalls: 2,
    officerRisk: 0.25,
    damage: 1,
    legitimacy: 1,
    opens: ['closed', 'ajar', 'open'],
    minOfficers: 2,
  },
  {
    id: 'ram',
    label: 'Ram',
    time: 3,
    noiseRadius: 9,
    noiseWalls: 2,
    officerRisk: 0.2,
    damage: 2,
    legitimacy: 2,
    opens: ['closed', 'locked', 'barred', 'ajar'],
    minOfficers: 1,
  },
  {
    id: 'shotgun',
    label: 'Shotgun',
    time: 2,
    noiseRadius: 13,
    noiseWalls: 3,
    officerRisk: 0.35,
    damage: 3,
    legitimacy: 4,
    opens: ['closed', 'locked', 'barred', 'ajar', 'wedged'],
    minOfficers: 1,
  },
];

export function entrySpec(id: EntryMethod): EntrySpec {
  const spec = ENTRY_METHODS.find((e) => e.id === id);
  if (!spec) throw new Error(`unknown entry method ${id}`);
  return spec;
}

export function canBreach(door: DoorState, method: EntryMethod): boolean {
  return entrySpec(method).opens.includes(door);
}

/**
 * Apply an entry method to a door. Returns the new state plus the noise, damage
 * and legitimacy the *record* will need. Pure: the caller decides what to do
 * with a failure.
 */
export function applyEntry(
  door: DoorDef,
  method: EntryMethod,
  officers: number,
): {
  ok: boolean;
  reason?: string;
  door: DoorDef;
  noise: Omit<NoiseEvent, 'tick'> | null;
  damage: number;
  legitimacy: number;
  officerRisk: number;
} {
  const spec = entrySpec(method);
  const unchanged = { door, damage: 0, legitimacy: 0, officerRisk: 0, noise: null };

  if (officers < spec.minOfficers) {
    return { ...unchanged, ok: false, reason: `${spec.label} needs ${spec.minOfficers} officers` };
  }
  if (!canBreach(door.state, method)) {
    return { ...unchanged, ok: false, reason: `a ${door.state} door cannot be beaten by ${spec.label}` };
  }

  const nextState: DoorState = spec.bypassesDoor
    ? 'open'
    : method === 'gas_wait'
      ? door.state === 'barred' ? 'barred' : 'closed'
      : method === 'shotgun'
        ? 'breached'
        : door.state === 'ajar'
          ? 'open'
          : 'open';

  return {
    ok: true,
    door: { ...door, state: nextState },
    noise: {
      source: noiseSourceFor(method),
      at: { x: door.x, y: door.y },
      radius: spec.noiseRadius,
      walls: spec.noiseWalls,
    },
    damage: spec.damage,
    legitimacy: spec.legitimacy,
    officerRisk: spec.officerRisk,
  };
}

function noiseSourceFor(method: EntryMethod): NoiseSource {
  switch (method) {
    case 'ram':
      return 'ram';
    case 'shotgun':
      return 'shotgun';
    case 'gas_wait':
      return 'gas';
    case 'shout_out':
    case 'knock_talk':
      return 'shout';
    case 'split_entry':
    case 'stack_enter':
    case 'roof_window':
      return 'door_open';
  }
}

/* ---------------------------------------------------------------- noise */

/**
 * Two rules, both countable on your fingers while looking at the plan:
 *
 *   1. **Walls stop noise.** Each kind of noise penetrates a fixed number of
 *      walls and then it is gone. A knock reaches zero walls; a shotgun reaches
 *      three.
 *   2. **Distance still matters.** Within the walls it can pass, each wall takes
 *      15% of the remaining reach, and below 1.5 tiles it is a rumour.
 *
 * The reason for the first rule over a pure damping model: a shotgun fired in a
 * rear room has to be audible from the street, or the game is quietly telling the
 * player that walls defeat sound, and then the whole noise→paperwork link is a
 * lie the audit cannot keep.
 */
export const WALL_DAMPING = 0.15;

/** Below this many tiles left, nobody reliably hears it. */
export const HEAR_THRESHOLD = 1.5;

export interface HeardResult {
  heard: boolean;
  /** effective radius left after walls */
  remaining: number;
  wallsCrossed: number;
}

/**
 * Does a listener at `at` hear a noise? Walks the tile line and counts walls.
 * Deterministic and cheap; called once per listener per noise event, not per tick.
 */
export function propagates(
  map: TileMap,
  noise: Omit<NoiseEvent, 'tick'>,
  at: Vec2,
): HeardResult {
  const origin = map.toTile(noise.at);
  const target = map.toTile(at);
  let walls = 0;
  let x = origin.tx;
  let y = origin.ty;
  const dx = Math.abs(target.tx - x);
  const dy = Math.abs(target.ty - y);
  const sx = x < target.tx ? 1 : -1;
  const sy = y < target.ty ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 4096; guard++) {
    if (!map.isWalkable(x, y)) walls += 1;
    if (x === target.tx && y === target.ty) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  const allowed = noise.walls ?? 0;
  if (walls > allowed) return { heard: false, remaining: 0, wallsCrossed: walls };
  const remaining = noise.radius * Math.max(0, 1 - walls * WALL_DAMPING);
  return { heard: remaining >= HEAR_THRESHOLD, remaining, wallsCrossed: walls };
}

/** How many listeners (hostiles, crowd, neighbours) would hear it. */
export function countListeners(
  map: TileMap,
  noise: Omit<NoiseEvent, 'tick'>,
  listeners: readonly { id: string; at: Vec2 }[],
): Array<{ id: string; outcome: HeardResult }> {
  return listeners
    .map((l) => ({ id: l.id, outcome: propagates(map, noise, l.at) }))
    .filter((l) => l.outcome.heard);
}
