/**
 * Shared vocabulary for the tactical layer (SYS-TACT-01).
 *
 * Kept in one file because every other tactical module speaks it: doors, the
 * force continuum, squads, crowds and the incident scene all need the same eight
 * orders and the same five rungs, and a second definition anywhere would drift.
 */

import type { Vec2 } from '@core/nav';


/* --------------------------------------------------------------- orders */

export const ORDERS = ['hold', 'move', 'stack', 'breach', 'clear', 'detain', 'escalate', 'regroup'] as const;
export type OrderKind = (typeof ORDERS)[number];

/** Hotkeys 1–8, as documented. Shared by squads and the solo player. */
export const ORDER_HOTKEYS: Record<string, OrderKind> = {
  '1': 'hold',
  '2': 'move',
  '3': 'stack',
  '4': 'breach',
  '5': 'clear',
  '6': 'detain',
  '7': 'escalate',
  '8': 'regroup',
};

export const ORDER_LABEL: Record<OrderKind, string> = {
  hold: 'Hold',
  move: 'Move',
  stack: 'Stack',
  breach: 'Breach',
  clear: 'Clear',
  detain: 'Detain',
  escalate: 'Escalate',
  regroup: 'Withdraw',
};

/** Solo play uses five of the eight; the rest grey out (Q2, leaning). */
export const SOLO_ORDERS: readonly OrderKind[] = ['hold', 'move', 'breach', 'detain', 'regroup'];

export interface Order {
  kind: OrderKind;
  /** a point for move/hold/stack/regroup, a target for detain */
  at?: Vec2;
  /** door id for stack/breach/clear */
  door?: string;
  /** room id for clear */
  room?: string;
  /** unit id for detain */
  target?: string;
  /** issued while paused? used for the comms-latency penalty */
  paused?: boolean;
}

/** A queued order plus the moment it was accepted, for the acknowledgement UI. */
export interface QueuedOrder extends Order {
  acceptedAt: number;
  /** sim-seconds until the unit starts acting on it (comms latency) */
  latency: number;
}

/* ---------------------------------------------------------------- force */

export type ForceRung = 1 | 2 | 3 | 4 | 5;

export const RUNG_LABEL: Record<ForceRung, string> = {
  1: 'Presence',
  2: 'Control',
  3: 'Compliance',
  4: 'Lethal',
  5: 'Collective',
};

/** What the report `force_tool` tag becomes at each rung. Rung 1 has none. */
export const RUNG_TOOL: Record<ForceRung, string | null> = {
  1: null,
  2: 'hands',
  3: 'baton',
  4: 'firearm',
  5: 'collective_order',
};

/** Weight added to a sector's force index (P2-T06). */
export const RUNG_WEIGHT: Record<ForceRung, number> = { 1: 0, 2: 1, 3: 2.5, 4: 6, 5: 9 };

/** Rung 4+ needs a logged Field Authorisation (P2-T05). */
export const RUNG_NEEDS_AUTHORISATION: ForceRung = 4;

export type WoundState = 'healthy' | 'winded' | 'wounded' | 'down' | 'dead';

export const WOUND_ORDER: WoundState[] = ['healthy', 'winded', 'wounded', 'down', 'dead'];

/* ----------------------------------------------------------------- rooms */

export interface SectorDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomDef {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** door ids that open into this room */
  doors: string[];
  /** false = only reachable by a window/roof entry */
  has_interior_access?: boolean;
}

export interface DoorDef {
  id: string;
  /** tile the door occupies */
  x: number;
  y: number;
  state: DoorState;
  /** which rooms it joins (one or two) */
  rooms: string[];
  /** bar/lock clue visible from the outside, for the silhouette read */
  appearance: 'plain' | 'barred' | 'reinforced' | 'ajar';
}

export type DoorState =
  | 'closed'
  | 'locked'
  | 'barred'
  | 'ajar'
  | 'open'
  | 'wedged'
  | 'breached';

export interface HostileDef {
  id: string;
  archetype: 'armed' | 'unarmed' | 'leader' | 'bystander';
  /** tile coordinates as authored: a `[x, y]` pair, matching the map files */
  post: [number, number];
  room: string;
  /** hiding places make "clear" a claim rather than a fact (P2-T08) */
  hides_in?: string;
  /** starts the scene in this room and does not move until rung 2 */
  stationary?: boolean;
}

export interface InteriorMapJson {
  id: string;
  name: string;
  note?: string;
  tileSize: number;
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, string>;
  rooms: RoomDef[];
  doors: DoorDef[];
  hostiles: HostileDef[];
  entry_points: Array<{ id: string; label: string; x: number; y: number }>;
  /** fixed cameras in the interior, if any */
  cameras?: Array<{ id: string; label: string; x: number; y: number; w: number; h: number }>;
}

/* ---------------------------------------------------------------- noise */

export type NoiseSource =
  | 'ram'
  | 'shotgun'
  | 'gas'
  | 'shout'
  | 'baton'
  | 'shot'
  | 'door_open'
  | 'boots'
  | 'crowd';

export interface NoiseEvent {
  source: NoiseSource;
  at: Vec2;
  /** how far it carries, in tiles */
  radius: number;
  /**
   * How many walls it goes *through* at all. A knock dies at the first wall; a
   * shotgun goes through three. This is the number a player can count on their
   * fingers while looking at the plan, which is why it is here instead of a
   * damping coefficient.
   */
  walls: number;
  tick: number;
}
