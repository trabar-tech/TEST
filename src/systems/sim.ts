/**
 * The simulation: one map, one pawn, one clock. This is Phase 0's whole game.
 *
 * Deliberately thin. It exists to prove four things end to end in a browser —
 * fixed-step timing, deterministic RNG, A* movement, save/restore — not to be
 * a game. Everything gameplay-shaped belongs to Phase 1+ and should not be
 * added here as a shortcut.
 */

import { Clock, type TimeMode } from '@core/clock';
import { EventBus } from '@core/bus';
import { World } from '@core/world';
import { TileMap, findPath, type Vec2 } from '@core/nav';
import { streamFor, type Rng } from '@core/rng';
import { emptyState, type GameState } from '@core/state';

/** The pawn's movement state. Lives *on the entity*, not on the Sim, so a
 *  world snapshot (and therefore a save) carries a half-walked route with it. */
export interface PawnComponents {
  pos: Vec2;
  facing: number;
  role: string;
  route: Vec2[];
  routeIndex: number;
}

export interface SimOptions {
  seed: number;
  shift?: number;
  map: TileMap;
  bus?: EventBus;
  /** render-side hook, called after each step with the pawn's interpolated position */
  onStep?: (tick: number) => void;
}

/**
 * Walking speed in *tiles* per second, converted using the map's tile size.
 * Expressing it in world units was a bug: a tile is 32 units here, so speed in
 * units made the pawn crawl at a twelfth of a tile per second.
 */
const SPEED_TILES_PER_SEC = 2.4;

/** Pawn collision radius, as a fraction of a tile. */
const BODY_RADIUS = 0.3;

export class Sim {
  readonly clock: Clock;
  readonly world = new World();
  readonly bus: EventBus;
  readonly map: TileMap;
  readonly state: GameState;

  private rng: Rng;
  private pawnId = 0;
  /** sub-tile position of the pawn, kept as floats for smooth motion */
  private pos: Vec2 = { x: 0, y: 0 };
  private facing = 0;
  /** leftover movement budget, so a slow frame doesn't truncate a step */
  private lastFrameTicks = 0;

  constructor(opts: SimOptions) {
    this.map = opts.map;
    this.bus = opts.bus ?? new EventBus({ recording: true });

    const state = emptyState(opts.seed);
    state.shift = opts.shift ?? 1;
    this.state = state;
    this.rng = streamFor(opts.seed, state.shift, 'pawn_fidget');

    const start = this.map.toWorld(Math.floor(this.map.width / 2), this.map.height - 3);
    const pawn = this.world.create('pawn', {
      pos: { x: start.x, y: start.y },
      facing: 0,
      role: 'warden',
      route: [],
      routeIndex: 0,
    } satisfies PawnComponents);
    this.pawnId = pawn.id;
    this.pos = { x: start.x, y: start.y };
    state.player.entityId = pawn.id;
    state.seed = opts.seed;
    state.contentVersion = '0.1.0';

    this.clock = new Clock({
      step: (dt) => this.step(dt),
      mode: 'patrol',
    });

    this.bus.emit('sim:ready', { seed: opts.seed, pawnId: pawn.id });
  }

  /* ------------------------------------------------------------- commands */

  /** Click-to-move. Returns false with a reason when there is no route. */
  moveTo(target: Vec2): { ok: true; waypoints: number } | { ok: false; reason: string } {
    const { tx, ty } = this.map.toTile(target);
    if (!this.map.isWalkable(tx, ty)) {
      this.bus.emit('nav:blocked', { target, reason: 'not_walkable' });
      return { ok: false, reason: 'That is inside a wall.' };
    }
    const path = findPath(this.map, this.pos, target, {
      radius: BODY_RADIUS * this.map.tileSize,
    });
    if (!path.found || path.waypoints.length === 0) {
      this.bus.emit('nav:blocked', { target, reason: 'no_route' });
      return { ok: false, reason: 'No route.' };
    }
    this.pawn.route = path.waypoints;
    this.pawn.routeIndex = 0;
    this.bus.emit('nav:ordered', {
      target,
      waypoints: path.waypoints.length,
      cost: Number(path.cost.toFixed(3)),
    });
    return { ok: true, waypoints: path.waypoints.length };
  }

  setMode(mode: TimeMode): void {
    this.clock.setMode(mode);
    this.bus.emit('clock:mode', { mode, timescale: this.clock.timescale });
  }

  /* ---------------------------------------------------------------- frame */

  /** Called once per animation frame by main.ts. Returns steps executed. */
  frame(): number {
    const steps = this.clock.frame();
    this.lastFrameTicks = steps;
    return steps;
  }

  get lastSteps(): number {
    return this.lastFrameTicks;
  }

  /** Fractional progress toward the next waypoint, for render interpolation. */
  get position(): Vec2 {
    return this.pos;
  }

  get heading(): number {
    return this.facing;
  }

  get isMoving(): boolean {
    return this.pawn.routeIndex < this.pawn.route.length;
  }

  get remainingWaypoints(): number {
    return Math.max(0, this.pawn.route.length - this.pawn.routeIndex);
  }

  /** Waypoints still to walk, for the debug path line. Read-only copy. */
  get remainingPath(): readonly Vec2[] {
    return this.pawn.route.slice(this.pawn.routeIndex);
  }

  private get pawn(): PawnComponents {
    const e = this.world.get(this.pawnId);
    if (!e) throw new Error('sim: pawn is missing from the world');
    return e.c as unknown as PawnComponents;
  }

  /* ----------------------------------------------------------------- step */

  private step(dt: number): void {
    const pawn = this.pawn;
    const travel = SPEED_TILES_PER_SEC * this.map.tileSize * dt;

    if (this.isMoving) {
      const target = pawn.route[pawn.routeIndex]!;
      const dx = target.x - this.pos.x;
      const dy = target.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= travel) {
        this.pos.x = target.x;
        this.pos.y = target.y;
        pawn.routeIndex += 1;
        if (!this.isMoving) this.finishOrder();
      } else {
        this.pos.x += (dx / dist) * travel;
        this.pos.y += (dy / dist) * travel;
        this.facing = Math.atan2(dy, dx);
      }
    } else if (this.clock.tick % 180 === 0) {
      // idle: a slow deterministic head-turn. Cheap, but it proves the RNG
      // stream is live and that the render layer reads sim state.
      this.facing = this.rng.next() * Math.PI * 2;
    }

    (pawn.pos as Vec2).x = Math.round(this.pos.x * 1000) / 1000;
    (pawn.pos as Vec2).y = Math.round(this.pos.y * 1000) / 1000;
    pawn.facing = Math.round(this.facing * 10000) / 10000;

    if (this.clock.tick % 60 === 0) {
      this.bus.emit('sim:second', {
        simSeconds: Number(this.clock.simSeconds.toFixed(2)),
        moving: this.isMoving,
      });
    }
  }

  private finishOrder(): void {
    const pawn = this.pawn;
    pawn.route = [];
    pawn.routeIndex = 0;
    this.bus.emit('nav:arrived', { x: Math.round(this.pos.x), y: Math.round(this.pos.y) });
  }

  /* -------------------------------------------------------- state / saves */

  /** Canonical sim state — this is what the state hash covers and a save holds. */
  snapshot(): GameState {
    this.state.world = this.world.snapshot();
    this.state.tick = {
      tick: this.clock.tick,
      simSeconds: this.clock.simSeconds,
      mode: this.clock.mode,
    };
    this.state.rng = { pawn_fidget: this.rng.state() };
    this.state.player.shiftSeconds = this.clock.simSeconds;
    return JSON.parse(JSON.stringify(this.state)) as GameState;
  }

  /** Restore sim state. The map is not part of the save; it comes from content. */
  restore(state: GameState): void {
    this.world.restore(state.world);
    this.clock.restore(state.tick);
    this.rng.restore(state.rng['pawn_fidget'] ?? this.rng.state());
    const pawn = state.player.entityId !== null ? this.world.get(state.player.entityId) : undefined;
    if (pawn) {
      const c = pawn.c as unknown as PawnComponents;
      this.pos = { x: c.pos.x, y: c.pos.y };
      this.facing = c.facing ?? 0;
      this.pawnId = pawn.id;
      // a route that was in progress resumes exactly where it was cut off
      c.route ??= [];
      c.routeIndex ??= 0;
    }
    Object.assign(this.state, state);
    this.bus.emit('sim:restored', { tick: state.tick.tick });
  }
}
