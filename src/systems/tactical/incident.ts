/**
 * The incident: a room you clear, and the paperwork it costs (SYS-TACT-01).
 *
 * This is the bridge the phase exists for. An incident is not a separate game
 * mode with its own rules — it runs on the same clock, the same order
 * vocabulary, and it writes into the same Record. Everything it can do to you
 * afterwards is a line you signed.
 *
 * Two rules keep it honest:
 *
 *  1. **Information gating.** Rooms you have not entered are silhouettes. You
 *     cannot see contents, and neither can your officers.
 *  2. **"Clear" is a claim.** Clearing is a statement about sectors your unit
 *     actually looked at. A hostile in a wardrobe is *not seen*, so the room
 *     reads cleared — and that is a wrong line waiting to happen (P2-T08).
 */

import { findPath, type TileMap, type Vec2 } from '@core/nav';
import { streamFor, type Rng } from '@core/rng';
import {
  ENTRY_METHODS,
  applyEntry,
  entrySpec,
  propagates,
  type EntryMethod,
} from './doors';
import {
  applyForce,
  isAuthorised,
  requestAuthorisation,
  startingMood,
  type Authorisation,
  type ForceIndex,
  type Target,
} from './force';
import { Squad, type OfficerDef } from './squad';
import type {
  DoorDef,
  ForceRung,
  InteriorMapJson,
  NoiseEvent,
  Order,
  OrderKind,
  RoomDef,
  WoundState,
} from './types';

export interface IncidentOptions {
  seed: number;
  shift: number;
  map: TileMap;
  json: InteriorMapJson;
  forceIndex: ForceIndex;
  officers?: readonly OfficerDef[];
  officerSpawns?: Record<string, Vec2>;
  /** solo incidents have no squad: Focus is the tool, Pause is dull */
  solo?: boolean;
}

export type RoomVisibility = 'silhouette' | 'known';

export interface HostileState extends Target {
  id: string;
  pos: Vec2;
  room: string;
  archetype: 'armed' | 'unarmed' | 'leader' | 'bystander';
  /** seen by a unit or a camera? */
  spotted: boolean;
  /** true once a unit has physically cleared their sector */
  cleared: boolean;
  /** hiding keeps them out of the clear claim */
  hiding: boolean;
}

export interface OfficerContact {
  officer: string;
  hostile: string;
  tick: number;
  rung: ForceRung;
}

export interface IncidentResult {
  /** the facts the Record will need, decided here and nowhere else */
  roomClaims: Array<{ room: string; claimedClear: boolean; actuallyClear: boolean }>;
  forceUsed: Array<{ hostile: string; rung: ForceRung; tool: string; logTag: string | null }>;
  damage: number;
  detainees: number;
  casualties: number;
  noiseEvents: number;
  loudestNoise: number;
  /** what the log can prove a neighbour heard */
  heardByNeighbours: number;
  wallsBreached: number;
  entryMethod: EntryMethod;
  unauthorisedForce: boolean;
  /** target ids that were stabilised: witnesses with a grudge */
  stabilised: string[];
  /** hostiles that were never found */
  unfound: string[];
  /** times the Warden was hit, solo only; 0 with a squad */
  soloHits: number;
  ticksElapsed: number;
}

/** Unit vector, or null for a zero direction (a non-input, not a still one). */
function normalise(v: Vec2): Vec2 | null {
  const d = Math.hypot(v.x, v.y);
  if (d < 1e-6) return null;
  return { x: v.x / d, y: v.y / d };
}

/** Smallest signed difference between two angles, in [-π, π]. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Incident {
  readonly map: TileMap;
  readonly json: InteriorMapJson;
  readonly squad: Squad | null;
  readonly rooms = new Map<string, RoomDef>();
  readonly doors = new Map<string, DoorDef>();
  readonly hostiles = new Map<string, HostileState>();
  readonly noises: NoiseEvent[] = [];
  readonly contacts: OfficerContact[] = [];

  visibilities = new Map<string, RoomVisibility>();
  /**
   * Rooms a unit has *claimed* clear. Kept as its own record because the claim is
   * the thing the player is answerable for, and it must survive the moment the
   * scene ends: `result()` reads it back as roomClaims.
   */
  clearClaims = new Map<string, boolean>();
  authorisation: Authorisation | null = null;
  tick = 0;
  simSeconds = 0;
  entryUsed: EntryMethod | null = null;
  wallsBreached = 0;
  damage = 0;
  detainees = 0;
  casualties = 0;
  stabilised: string[] = [];
  forceUsed: IncidentResult['forceUsed'] = [];
  unauthorisedForce = false;
  /** solo: the Warden's own position, focus state, and exposure to return fire */
  soloHits = 0;
  /**
   * Counts down to the next shot *from the moment there is a threat*, so the
   * first reaction is the cadence itself rather than an infinite grace period.
   * (Initialising this to Infinity meant no subject ever fired: a lesson in why
   * "survivable" needs a measured rate, not a plausible-looking field.)
   */
  soloSecondsToHit = 2.2;
  /** solo: the Warden's own position and focus state */
  warden: Vec2;
  focusActive = false;
  focusStamina = 1;
  ended = false;

  private readonly rng: Rng;

  constructor(private readonly opts: IncidentOptions) {
    this.map = opts.map;
    this.json = opts.json;
    this.rng = streamFor(opts.seed, opts.shift, 'incident');
    for (const room of opts.json.rooms) {
      this.rooms.set(room.id, room);
      this.visibilities.set(room.id, 'silhouette');
    }
    for (const door of opts.json.doors) this.doors.set(door.id, { ...door });
    const mood = startingMood(opts.forceIndex);
    for (const h of opts.json.hostiles) {
      this.hostiles.set(h.id, {
        id: h.id,
        // `post` is a [x, y] pair in the JSON, not a Vec2: the two shapes differ
        // and a NaN position here once put every subject at (NaN, NaN), which is
        // precisely the kind of bug a ticket-per-behaviour test catches late.
        pos: { x: h.post[0] * this.map.tileSize, y: h.post[1] * this.map.tileSize },
        room: h.room,
        archetype: h.archetype,
        compliance: mood.compliance,
        aggression: mood.aggression,
        wound: 'healthy',
        detained: false,
        stabilised: false,
        spotted: false,
        cleared: false,
        hiding: Boolean(h.hides_in),
      });
    }
    this.warden = {
      x: (opts.json.entry_points[0]?.x ?? 1) * this.map.tileSize,
      y: (opts.json.entry_points[0]?.y ?? 1) * this.map.tileSize,
    };

    const officers = opts.solo ? [] : (opts.officers ?? []);
    this.squad =
      officers.length > 0
        ? new Squad({
            map: this.map,
            officers,
            spawns: opts.officerSpawns ?? {},
            rng: this.rng,
          })
        : null;
  }

  /* -------------------------------------------------------------- queries */

  get hasSquad(): boolean {
    return this.squad !== null && this.squad.size > 0;
  }

  /** What the player may know about a room. Silhouette = walls, no contents. */
  visibleHostiles(room?: string): HostileState[] {
    const out: HostileState[] = [];
    for (const h of this.hostiles.values()) {
      if (room !== undefined && h.room !== room) continue;
      // a hiding hostile is never visible, even in a known room: that is the point
      if (h.hiding && !h.spotted) continue;
      if (h.spotted || this.visibilities.get(h.room) === 'known') out.push(h);
    }
    return out;
  }

  /** Interior centre of a room, in world units. */
  roomCentre(room: RoomDef): Vec2 {
    return {
      x: (room.x + room.w / 2) * this.map.tileSize,
      y: (room.y + room.h / 2) * this.map.tileSize,
    };
  }

  doorAt(x: number, y: number): DoorDef | undefined {
    return [...this.doors.values()].find((d) => d.x === x && d.y === y);
  }

  /* -------------------------------------------------------------- actions */

  /**
   * Enter a room. This is the moment information stops being free: the room
   * becomes `known`, everything in it is spotted unless it is hiding, and the
   * noise the entry makes is logged with a radius a neighbour could hear.
   */
  enterRoom(roomId: string, method: EntryMethod, officers: number): {
    ok: boolean;
    reason?: string;
    noise?: NoiseEvent;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: 'no such room' };
    const spec = entrySpec(method);
    if (officers < spec.minOfficers) {
      return { ok: false, reason: `${spec.label} needs ${spec.minOfficers} officers` };
    }
    const door = room.doors.map((id) => this.doors.get(id)).find((d) => d !== undefined && d.state !== 'open');
    if (!spec.bypassesDoor && door) {
      const res = applyEntry(door, method, officers);
      if (!res.ok) return { ok: false, reason: res.reason };
      this.doors.set(door.id, res.door);
      this.damage += res.damage;
      if (res.officerRisk > 0 && this.rng.chance(res.officerRisk * 0.35)) {
        const unit = this.squad?.all()[0];
        if (unit) this.squad?.applyWound(unit.id, 'wounded');
      }
    } else if (spec.bypassesDoor) {
      this.wallsBreached += 1;
      this.damage += spec.damage;
    }

    this.entryUsed ??= method;
    this.visibilities.set(roomId, 'known');
    for (const h of this.hostiles.values()) {
      if (h.room !== roomId) continue;
      if (h.hiding && !this.rng.chance(method === 'gas_wait' ? 0.85 : 0.35)) continue;
      h.hiding = false;
      h.spotted = true;
      if (h.archetype === 'armed' && this.squad) {
        for (const unit of this.squad.all()) this.squad.onContact(unit.id, this.simSeconds);
      }
    }

    // Render the noise from the room's centre, not the door hinge: the sound is
    // made by bodies inside the flat, and measuring from a doorway would let a
    // conveniently aligned corridor swallow it entirely.
    const noise: NoiseEvent = {
      source: spec.noiseRadius >= 8 ? 'ram' : 'door_open',
      at: this.roomCentre(room),
      radius: spec.noiseRadius,
      walls: spec.noiseWalls,
      tick: this.tick,
    };
    this.noises.push(noise);
    return { ok: true, noise };
  }

  /**
   * Clear a room. Returns whether the *claim* was true, which the player never
   * sees directly — the record will.
   */
  clearRoom(roomId: string): { claimed: boolean; actuallyClear: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) return { claimed: false, actuallyClear: false };
    const hidden = [...this.hostiles.values()].filter(
      (h) => h.room === roomId && h.wound !== 'dead' && h.wound !== 'down' && !h.detained,
    );
    // a unit can only clear what it can see, so a hidden hostile leaves the room
    // "cleared" — the claim and the fact come apart exactly here
    const claimable = hidden.filter((h) => !h.hiding && h.spotted).length === 0;
    const actuallyClear = hidden.length === 0;
    for (const h of hidden) if (!h.hiding && h.spotted) h.cleared = true;
    // the claim is sticky: a room reported clear stays reported clear, even if
    // somebody later proves it was not. That is what makes it a claim.
    if (claimable) this.clearClaims.set(roomId, true);
    return { claimed: claimable, actuallyClear };
  }

  /** Bring force to bear on a hostile. Rung 2+ always writes exactly one line. */
  applyForceTo(hostileId: string, rung: ForceRung, opts: { tool?: string; authorised?: boolean } = {}): {
    outcome: ReturnType<typeof applyForce> | null;
    reason?: string;
  } {
    const h = this.hostiles.get(hostileId);
    if (!h) return { outcome: null, reason: 'no such target' };
    const authorised = opts.authorised ?? isAuthorised(this.authorisation, rung, this.simSeconds);
    if (rung >= 4 && !authorised) this.unauthorisedForce = true;
    const tool = opts.tool ?? defaultTool(rung);
    const outcome = applyForce(h, {
      rung,
      tool,
      witnesses: this.visibleHostiles().length - 1,
      area: rung >= 3,
    }, { authorised });

    const next: HostileState = { ...h, ...outcome.target };
    if (next.wound === 'down' && next.archetype !== 'bystander') this.casualties += 0;
    this.hostiles.set(hostileId, next);
    this.damage = Math.min(3, this.damage + outcome.damage);
    if (outcome.needsLine) {
      this.forceUsed.push({ hostile: hostileId, rung, tool, logTag: outcome.logTag });
      this.noises.push({
        source: rung >= 4 ? 'shot' : 'baton',
        at: h.pos,
        radius: rung >= 4 ? 14 : 3,
        walls: rung >= 4 ? 3 : 1,
        tick: this.tick,
      });
    }
    if (next.wound === 'dead' || next.wound === 'down') this.casualties += 1;
    return { outcome };
  }

  detain(hostileId: string): boolean {
    const h = this.hostiles.get(hostileId);
    if (!h) return false;
    if (h.compliance < 60 && h.wound === 'healthy') return false;
    this.hostiles.set(hostileId, { ...h, detained: true });
    this.detainees += 1;
    return true;
  }

  /** Stabilise a downed target: they become a witness, not a corpse. */
  stabilise(hostileId: string): boolean {
    const h = this.hostiles.get(hostileId);
    if (!h || h.wound !== 'down') return false;
    this.hostiles.set(hostileId, { ...h, stabilised: true, wound: 'wounded' });
    this.stabilised.push(hostileId);
    return true;
  }

  requestAuthority(rung: ForceRung): Authorisation {
    this.authorisation = requestAuthorisation(rung, this.simSeconds);
    return this.authorisation;
  }

  /**
   * Charge the world for one deliberate action. Called by whatever issued it —
   * the UI, a test, a script — so that thinking too long in a firefight is a
   * cost the simulation can see.
   */
  noteAction(): number {
    const cost = Incident.SOLO_DECISION_SECONDS * (this.focusActive ? Incident.FOCUS_TIMESCALE : 1);
    this.soloExposure += cost;
    if (this.soloSecondsToHit !== Infinity) this.soloSecondsToHit -= cost;
    return cost;
  }

  /* --------------------------------------------------------------- orders */

  issue(order: Order, officerId?: string): { ok: boolean; reason?: string } {
    if (!this.squad) {
      // solo: the order vocabulary still works, it just has one executor
      return this.issueSolo(order);
    }
    const ids = officerId ? [officerId] : this.squad.all().map((u) => u.id);
    for (const id of ids) {
      const res = this.squad.order(id, order, this.simSeconds);
      if (!res.ok) return res;
    }
    if (order.kind === 'breach' && order.door) {
      const door = this.doors.get(order.door);
      const room = door?.rooms.find((r) => this.rooms.has(r));
      if (room) this.enterRoom(room, this.entryUsed ?? 'stack_enter', this.squad.size);
    }
    return { ok: true };
  }

  private issueSolo(order: Order): { ok: boolean; reason?: string } {
    if (order.kind === 'breach' && order.room) {
      const res = this.enterRoom(order.room, 'ram', 1);
      return { ok: res.ok, ...(res.reason === undefined ? {} : { reason: res.reason }) };
    }
    if (order.kind === 'move' && order.at) {
      const path = findPath(this.map, this.warden, order.at, {
        radius: 0.3 * this.map.tileSize,
      });
      if (!path.found) return { ok: false, reason: 'no route' };
      this.soloRoute = path.waypoints;
      this.soloRouteIndex = 0;
      return { ok: true };
    }
    if (order.kind === 'detain' && order.target) return { ok: this.detain(order.target) };
    return { ok: true };
  }

  private soloRoute: Vec2[] = [];
  private soloRouteIndex = 0;

  /**
   * Direct control of the Warden (playtest 2: "a tactical shooter with bureaucracy sim").
   *
   * Until now the Warden moved only by executing an *order* — the plan board told the body
   * where to go. That reads as a strategy layer, not a shooter, because the player never
   * controls the thing that is in danger. These three methods are the missing half: WASD
   * moves the body, the mouse aims, and the trigger is a trigger.
   *
   * Deliberately small, because everything here is *paperwork's* input: the shot is recorded
   * as force used, the hit is recorded as a hit, and the record does not care how good you are.
   */
  setMoveIntent(dir: Vec2 | null): void {
    this.moveIntent = dir ? normalise(dir) : null;
    // a held direction overrides a queued route: the player is driving now
    if (dir) {
      this.soloRoute = [];
      this.soloRouteIndex = 0;
    }
  }

  private moveIntent: Vec2 | null = null;

  /** Aim, in world radians. The renderer draws it; hostile fire does not read it. */
  setAim(angle: number): void {
    this.aim = angle;
  }

  aim = 0;

  /**
   * Whether the aim line currently runs into a wall.
   *
   * Drawn rather than enforced: the player should see a wall in the way without the game
   * refusing the input, because a shot into a wall is a *fact about tonight* and the record
   * is the thing that cares.
   */
  get aimLineBlocked(): boolean {
    const reach = 3.2 * this.map.tileSize;
    const step = this.map.tileSize * 0.25;
    for (let d = step; d <= reach; d += step) {
      const p = { x: this.warden.x + Math.cos(this.aim) * d, y: this.warden.y + Math.sin(this.aim) * d };
      const tile = this.map.toTile(p);
      if (!this.map.isWalkable(tile.tx, tile.ty)) return true;
    }
    return false;
  }

  /**
   * Fire.
   *
   * The honest design constraint: this is **not** an aim skill check. A shot that happens at
   * all is a shot that occurred, and the paperwork records it — `forceUsed` gains a rung-5
   * entry and the exposure of the line afterwards is the real cost. Whether it hits is a
   * geometry question (is anything in the lane, close enough), not a reflex question, because
   * the game's claim is about consequences, not about twitch.
   */
  fire(): { fired: boolean; hit: string | null; reason?: string } {
    if (this.ended) return { fired: false, hit: null, reason: 'the incident is over' };
    if (this.fireCooldown > 0) return { fired: false, hit: null, reason: 'the weapon is empty' };
    this.fireCooldown = Incident.FIRE_COOLDOWN;

    const range = 6 * this.map.tileSize;
    const target = this.targetInLane(range);
    this.forceUsed.push({
      hostile: target?.id ?? 'none',
      rung: 5 as ForceRung,
      tool: 'firearm',
      logTag: target ? 'fired_on_subject' : 'fired_into_room',
    });
    // lethal force without a grant is the finding the audit looks for first
    this.unauthorisedForce = this.authorisation === null || this.authorisation.rung < 5;
    // the shot is the loudest thing in the building, and it is the thing a report notices
    this.noises.push({ source: 'shot', at: { ...this.warden }, radius: 16, walls: 4, tick: this.tick });
    if (!target) return { fired: true, hit: null };
    target.wound = target.wound === 'healthy' ? 'wounded' : 'dead';
    if (target.wound === 'dead') this.casualties += 1;
    return { fired: true, hit: target.id };
  }

  private fireCooldown = 0;
  static readonly FIRE_COOLDOWN = 0.55;

  /** The nearest spotted, upright hostile inside a narrow cone ahead. */
  private targetInLane(range: number): HostileState | null {
    let best: HostileState | null = null;
    let bestDist = range;
    for (const h of this.hostiles.values()) {
      if (h.detained || h.wound === 'dead') continue;
      const dx = h.pos.x - this.warden.x;
      const dy = h.pos.y - this.warden.y;
      const d = Math.hypot(dx, dy);
      if (d > bestDist || d < 1) continue;
      const delta = Math.abs(angleDelta(Math.atan2(dy, dx), this.aim));
      // generous: 30 degrees, because a shooter without a crosshair should not feel cheated
      if (delta > Math.PI / 6) continue;
      best = h;
      bestDist = d;
    }
    return best;
  }

  /**
   * Focus is a **timescale**, not a buff (SYS-TACT-01 §1): the world runs at
   * 0.35× while it is held. It is deliberately *not* a movement multiplier — you
   * cover the same ground per sim-second, you simply get 2.9× more real seconds
   * in which to spend it. That is what buys the player the room, and it is why
   * the mechan ic can be honest without an aim system.
   */
  static readonly FOCUS_TIMESCALE = 0.35;
  /** 6 s of held time, 9 s to recharge, in *wall* seconds */
  static readonly FOCUS_BUDGET = 6;
  static readonly FOCUS_RECHARGE = 9;

  setFocus(held: boolean, dt: number): void {
    if (held && this.focusStamina > 0 && !this.hasSquad) {
      this.focusStamina = Math.max(0, this.focusStamina - dt / Incident.FOCUS_BUDGET);
      this.focusActive = this.focusStamina > 0;
    } else {
      this.focusActive = false;
      this.focusStamina = Math.min(1, this.focusStamina + dt / Incident.FOCUS_RECHARGE);
    }
  }

  /* ----------------------------------------------------------------- step */

  step(dt: number): void {
    if (this.ended) return;
    // Focus slows the world, not the player's hands: same sim-metres per
    // sim-second, 2.9× more real time to decide in.
    const worldDt = this.focusActive ? dt * Incident.FOCUS_TIMESCALE : dt;
    this.tick += 1;
    this.simSeconds += worldDt;

    if (this.squad) this.squad.step(worldDt, this.simSeconds);
    else this.stepSolo(worldDt);

    // hostiles notice a known room's occupants and drift toward the door
    for (const h of this.hostiles.values()) {
      if (h.detained || h.wound === 'dead' || h.wound === 'down') continue;
      if (this.visibilities.get(h.room) !== 'known') continue;
      h.spotted = true;
    }
  }

  /**
   * Solo combat, kept deliberately small. An armed subject in a *known* room
   * fires on a cadence; Focus buys you movement, not safety, because it does not
   * slow enemy reaction (SYS-TACT-01 Q1). That is the whole risk of the mechanic:
   * it makes you faster at the thing that gets you shot.
   */
  static readonly SOLO_HIT_SECONDS = 2.2;
  /** tiles per second under direct control (the route speed stays 2.4) */
  static readonly SOLO_SPEED = 3.1;

  /**
   * How much *sim* time a deliberate player action costs. This exists because
   * Focus cannot be modelled as a speed multiplier and still be honest: the
   * player's own reaction is in wall-clock, the world's is in sim-clock, and the
   * only place the two meet is exactly here.
   *
   * Unfocused, a decision costs 0.7 sim-seconds of exposure; focused, 0.245. So
   * Focus does not make you faster — it makes the world wait while you think,
   * which is what slow-motion is for.
   */
  static readonly SOLO_DECISION_SECONDS = 0.7;
  /** Sim-seconds of exposure the player has spent on deliberate actions so far. */
  soloExposure = 0;

  private stepSolo(dt: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // direct control first: a held direction wins over a queued route
    if (this.moveIntent) {
      const speed = Incident.SOLO_SPEED * this.map.tileSize * dt;
      const nx = this.warden.x + this.moveIntent.x * speed;
      const ny = this.warden.y + this.moveIntent.y * speed;
      const tile = this.map.toTile({ x: nx, y: ny });
      // walls stop the body; sliding is not modelled, because a shooter needs a readable wall
      if (this.map.isWalkable(tile.tx, tile.ty)) this.warden = { x: nx, y: ny };
      this.soloRoute = [];
      this.soloRouteIndex = 0;
    }

    const wardenTile = this.map.toTile(this.warden);
    const armed = [...this.hostiles.values()].filter((h) => {
      if (h.archetype !== 'armed' || h.wound !== 'healthy' || h.detained || !h.spotted) return false;
      // a compliant subject has stopped shooting: compliance is what ends a
      // standoff, and it is why the continuum exists at all
      if (h.compliance >= 60) return false;
      const room = this.rooms.get(h.room);
      if (!room) return false;
      return (
        wardenTile.tx >= room.x &&
        wardenTile.tx < room.x + room.w &&
        wardenTile.ty >= room.y &&
        wardenTile.ty < room.y + room.h
      );
    });
    if (armed.length > 0) {
      this.soloSecondsToHit -= dt;
      if (this.soloSecondsToHit <= 0) {
        this.soloHits += 1;
        this.soloSecondsToHit = Incident.SOLO_HIT_SECONDS;
        this.noises.push({
          source: 'shot',
          at: armed[0]!.pos,
          radius: 14,
          walls: 3,
          tick: this.tick,
        });
      }
    } else {
      // out of the line of fire: the subject loses track of you, but the moment
      // you are back in the room the clock starts again from a full cadence
      this.soloSecondsToHit = Incident.SOLO_HIT_SECONDS;
    }

    if (this.soloRouteIndex >= this.soloRoute.length) return;
    const wp = this.soloRoute[this.soloRouteIndex]!;
    const speed = 2.4 * this.map.tileSize * dt;
    const dx = wp.x - this.warden.x;
    const dy = wp.y - this.warden.y;
    const d = Math.hypot(dx, dy);
    if (d <= speed) {
      this.warden = { x: wp.x, y: wp.y };
      this.soloRouteIndex += 1;
    } else {
      this.warden = { x: this.warden.x + (dx / d) * speed, y: this.warden.y + (dy / d) * speed };
    }
  }

  /* --------------------------------------------------------------- result */

  /**
   * The facts, as the Record will receive them. Called once, when the incident
   * ends; the caller turns these into exactly one line (P2-T08).
   */
  result(): IncidentResult {
    const roomClaims = [...this.rooms.keys()]
      .filter((id) => this.visibilities.get(id) === 'known')
      .map((room) => {
        // recompute the *fact*, but never re-derive the *claim*: a room the
        // player reported clear stays on the record as reported clear
        const hidden = [...this.hostiles.values()].filter(
          (h) => h.room === room && h.wound !== 'dead' && h.wound !== 'down' && !h.detained,
        );
        const actuallyClear = hidden.length === 0;
        const claimedClear = this.clearClaims.get(room) === true;
        return { room, claimedClear, actuallyClear };
      });

    const unfound = [...this.hostiles.values()]
      .filter((h) => !h.spotted && !h.detained && h.wound !== 'dead')
      .map((h) => h.id);

    const heard = this.noises.filter((n) => {
      // a neighbour two rooms away: propagate from the noise source to the street
      const outside = this.json.entry_points[0];
      if (!outside) return false;
      const at = { x: outside.x * this.map.tileSize, y: outside.y * this.map.tileSize };
      return propagates(this.map, { source: n.source, at: n.at, radius: n.radius, walls: n.walls }, at).heard;
    }).length;

    return {
      roomClaims,
      forceUsed: this.forceUsed,
      damage: this.damage,
      detainees: this.detainees,
      casualties: this.casualties,
      noiseEvents: this.noises.length,
      loudestNoise: Math.max(0, ...this.noises.map((n) => n.radius)),
      heardByNeighbours: heard,
      wallsBreached: this.wallsBreached,
      entryMethod: this.entryUsed ?? 'knock_talk',
      unauthorisedForce: this.unauthorisedForce,
      stabilised: [...this.stabilised],
      unfound,
      ticksElapsed: this.tick,
      soloHits: this.soloHits,
    };
  }

  /** A copy of the scene's facts, safe to store on a docket card. */
  snapshot(): IncidentResult {
    return this.result();
  }

  /** What the Eye would have told you, before you went in. */
  recon(): Array<{ room: string; label: string; contents: 'unknown' | 'known'; hint: string }> {
    return this.json.rooms.map((r) => ({
      room: r.id,
      label: r.label,
      contents: this.visibilities.get(r.id) === 'known' ? 'known' : 'unknown',
      hint:
        this.visibilities.get(r.id) === 'known'
          ? `${this.visibleHostiles(r.id).length} visible`
          : silhouetteHint(r, this.json),
    }));
  }
}

function defaultTool(rung: ForceRung): string {
  return rung <= 2 ? 'hands' : rung === 3 ? 'baton' : rung === 4 ? 'firearm' : 'collective_order';
}

/**
 * The silhouette read: walls only, plus one *architectural* fact that a local
 * officer would know from the outside — is it barred, does it have a window, is
 * there a light on. No contents, ever.
 */
function silhouetteHint(room: RoomDef, json: InteriorMapJson): string {
  const door = room.doors
    .map((id) => json.doors.find((d) => d.id === id))
    .find((d) => d !== undefined);
  if (!door) return 'no visible entrance';
  switch (door.appearance) {
    case 'barred':
      return 'the door is barred from the inside';
    case 'reinforced':
      return 'reinforced door, no window';
    case 'ajar':
      return 'the door is ajar';
    default:
      return 'door closed, light under it';
  }
}

export const ALL_ENTRY_METHODS = ENTRY_METHODS;
export type { EntryMethod, OrderKind, WoundState };
