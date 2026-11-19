/**
 * Officers as literal executors (P2-T04).
 *
 * The design claim is that **officers do not invent plans**. They run a queue you
 * gave them, pathfind, take cover, and shoot when authorised. That is not a
 * limitation to apologise for — it is what makes the player the author, and it is
 * why a mis-cleared room is *your* line and not a bug.
 *
 * Two cheap "thinking" tells are the only initiative they get: double back ~40%
 * of the way to a point of interest, and stand-and-look on arrival. Twenty lines,
 * and it is what players read as competence (research §02, borrowed from
 * Isolation's alien — the only part of it we want).
 */

import { findPath, type TileMap, type Vec2 } from '@core/nav';
import type { Rng } from '@core/rng';
import type { Order, OrderKind, QueuedOrder, WoundState } from './types';

export type Trait = 'disciplined' | 'jumpy' | 'methodical' | 'talker' | 'bruiser' | 'paper_pusher';

export interface OfficerDef {
  id: string;
  name: string;
  /** shown in the roster, never in-world as a number */
  traits: Trait[];
}

export interface OfficerState {
  id: string;
  pos: Vec2;
  facing: number;
  queue: QueuedOrder[];
  /** where the unit is walking, if anywhere */
  route: Vec2[];
  routeIndex: number;
  wound: WoundState;
  /** true once contact has broken the queue this tick */
  shaken: boolean;
  /** 0–1, rises while shot at */
  nerve: number;
  /** acknowledgement text for the last accepted order */
  ack: string | null;
  /** sim-seconds the ack stays visible */
  ackUntil: number;
  /** how long this unit must still wait on its current order */
  orderBusyUntil: number;
}

export const QUEUE_DEPTH = 4;
/** orders issued while paused take this much longer to acknowledge (SYS-TACT-01 §1) */
export const PAUSE_LATENCY = 0.4;
/** Flow: 3+ distinct orders inside this window, while unpaused */
export const FLOW_WINDOW = 5;
export const FLOW_DURATION = 8;
export const FLOW_BONUS = 0.2;

const ACKS: Record<OrderKind, string[]> = {
  hold: ['holding.', 'standing by.'],
  move: ['moving.', 'on it.'],
  stack: ['stacking.', 'on the door.'],
  breach: ['breaching.', 'going in.'],
  clear: ['clearing.', 'checking it.'],
  detain: ['detaining.', 'cuffing.'],
  escalate: ['escalating.', 'stepping up.'],
  regroup: ['falling back.', 'pulling out.'],
};

export interface SquadOptions {
  map: TileMap;
  officers: readonly OfficerDef[];
  spawns: Record<string, Vec2>;
  rng: Rng;
}

export class Squad {
  private readonly state = new Map<string, OfficerState>();
  /** timestamps of recent orders, for the Flow check */
  private recentOrders: Array<{ kind: OrderKind; at: number }> = [];
  flowUntil = 0;

  constructor(private readonly opts: SquadOptions) {
    for (const def of opts.officers) {
      const spawn = opts.spawns[def.id] ?? { x: 0, y: 0 };
      this.state.set(def.id, {
        id: def.id,
        pos: { ...spawn },
        facing: 0,
        queue: [],
        route: [],
        routeIndex: 0,
        wound: 'healthy',
        shaken: false,
        nerve: 1,
        ack: null,
        ackUntil: 0,
        orderBusyUntil: 0,
      });
    }
  }

  get officers(): readonly OfficerDef[] {
    return this.opts.officers;
  }

  get(id: string): OfficerState | undefined {
    return this.state.get(id);
  }

  all(): OfficerState[] {
    return [...this.state.values()].filter((s) => s.wound !== 'dead');
  }

  def(id: string): OfficerDef | undefined {
    return this.opts.officers.find((o) => o.id === id);
  }

  has(id: string, trait: Trait): boolean {
    return this.def(id)?.traits.includes(trait) ?? false;
  }

  get size(): number {
    return this.all().length;
  }

  /**
   * Accept an order. Returns false with a reason when the queue is full, which
   * the UI shows rather than silently dropping.
   */
  order(id: string, order: Order, now: number): { ok: boolean; reason?: string } {
    const unit = this.state.get(id);
    if (!unit) return { ok: false, reason: 'no such officer' };
    if (unit.wound === 'dead' || unit.wound === 'down') return { ok: false, reason: 'down' };
    if (unit.queue.length >= QUEUE_DEPTH) return { ok: false, reason: 'queue full' };

    const latency = (order.paused ? PAUSE_LATENCY : 0) + (this.flowUntil > now ? -FLOW_BONUS : 0);
    const queued: QueuedOrder = {
      ...order,
      acceptedAt: now,
      // Flow can never make an order *invisible* by being negative
      latency: Math.max(0, latency),
    };
    unit.queue.push(queued);
    unit.ack = pick(this.opts.rng, ACKS[order.kind]);
    unit.ackUntil = now + 1.6;

    if (!order.paused) {
      this.recentOrders.push({ kind: order.kind, at: now });
      this.recentOrders = this.recentOrders.filter((o) => now - o.at <= FLOW_WINDOW);
      const distinct = new Set(this.recentOrders.map((o) => o.kind));
      if (distinct.size >= 3) this.flowUntil = now + FLOW_DURATION;
    }
    return { ok: true };
  }

  /**
   * Contact breaks the queue — unless the unit is `Disciplined`. This is the one
   * trait that decisively changes play, and the reason a plan either survives
   * first contact or becomes a firefight.
   */
  onContact(id: string, now: number): { dropped: number } {
    const unit = this.state.get(id);
    if (!unit) return { dropped: 0 };
    unit.shaken = true;
    if (this.has(id, 'disciplined')) return { dropped: 0 };
    const dropped = unit.queue.length;
    unit.queue = [];
    unit.route = [];
    unit.routeIndex = 0;
    unit.ack = 'contact!';
    unit.ackUntil = now + 1.6;
    return { dropped };
  }

  /** One sim step: walk the current order, then pop it when it completes. */
  step(dt: number, now: number): void {
    for (const unit of this.state.values()) {
      if (unit.wound === 'dead' || unit.wound === 'down') continue;
      if (unit.nerve > 0.4) unit.shaken = false;
      // nerve recovers slowly; being shot at is handled by the caller
      unit.nerve = Math.min(1, unit.nerve + dt * 0.05);

      const current = unit.queue[0];
      if (!current) {
        // idle tell: stand and look, rotating through two facings
        if (unit.route.length === 0) unit.facing += dt * 0.6;
        continue;
      }
      if (now < current.acceptedAt + current.latency) continue;
      if (now < unit.orderBusyUntil) continue;

      // orders that need a destination become walking; the rest are timed
      if (current.at && unit.route.length === 0 && !atPoint(unit.pos, current.at)) {
        const path = findPath(this.opts.map, unit.pos, current.at, {
          radius: 0.3 * this.opts.map.tileSize,
        });
        if (path.found) {
          unit.route = path.waypoints;
          unit.routeIndex = 0;
        }
      }

      if (unit.routeIndex < unit.route.length) {
        const wp = unit.route[unit.routeIndex]!;
        const speed =
          2.1 * this.opts.map.tileSize * dt * (1 + (this.flowUntil > now ? FLOW_BONUS : 0));
        const dx = wp.x - unit.pos.x;
        const dy = wp.y - unit.pos.y;
        const d = Math.hypot(dx, dy);
        if (d <= speed) {
          unit.pos = { x: wp.x, y: wp.y };
          unit.routeIndex += 1;
          if (unit.routeIndex >= unit.route.length) {
            unit.route = [];
            unit.routeIndex = 0;
            // the idle tell on arrival: double back a little, then settle
            if (current.kind === 'clear') {
              unit.facing = Math.atan2(
                this.opts.map.height * 0.5 * this.opts.map.tileSize - unit.pos.y,
                this.opts.map.width * 0.5 * this.opts.map.tileSize - unit.pos.x,
              );
            }
          }
        } else {
          unit.pos = { x: unit.pos.x + (dx / d) * speed, y: unit.pos.y + (dy / d) * speed };
          unit.facing = Math.atan2(dy, dx);
        }
        continue;
      }

      // no destination left: the order's own duration decides when it is done
      const duration = orderDuration(current);
      if (unit.orderBusyUntil === 0) unit.orderBusyUntil = now + duration;
      if (now >= unit.orderBusyUntil) {
        unit.orderBusyUntil = 0;
        unit.queue.shift();
      }
    }
  }

  /**
   * Reorder a unit's queue. Drag-reorder in the UI, but the *rule* belongs here:
   * a plan you can rewrite is a plan, and the queue is the only thing the player
   * actually authored in the scene.
   */
  reorder(id: string, from: number, to: number): boolean {
    const unit = this.state.get(id);
    if (!unit) return false;
    if (from < 0 || to < 0 || from >= unit.queue.length || to >= unit.queue.length) return false;
    if (from === to) return true;
    const [moved] = unit.queue.splice(from, 1);
    if (!moved) return false;
    unit.queue.splice(to, 0, moved);
    return true;
  }

  /** Drop one queued order without touching the rest. */
  cancel(id: string, index: number): boolean {
    const unit = this.state.get(id);
    if (!unit || index < 0 || index >= unit.queue.length) return false;
    unit.queue.splice(index, 1);
    return true;
  }

  /** Rough sim-seconds each order occupies the unit. */
  static durationOf(order: Order): number {
    return orderDuration(order);
  }

  /** The comms strip: who is doing what, and what they said about it. */
  snapshot(now: number): Array<{
    id: string;
    name: string;
    queue: OrderKind[];
    ack: string | null;
    wound: WoundState;
  }> {
    return this.all().map((u) => ({
      id: u.id,
      name: this.def(u.id)?.name ?? u.id,
      queue: u.queue.map((q) => q.kind),
      ack: u.ackUntil > now ? u.ack : null,
      wound: u.wound,
    }));
  }

  applyWound(id: string, wound: WoundState): void {
    const unit = this.state.get(id);
    if (unit) unit.wound = wound;
  }
}

function orderDuration(order: Order): number {
  switch (order.kind) {
    case 'hold':
      return 2;
    case 'move':
      return 0.5;
    case 'stack':
      return 3;
    case 'breach':
      return 2.5;
    case 'clear':
      return 4;
    case 'detain':
      return 3;
    case 'escalate':
      return 1;
    case 'regroup':
      return 2;
  }
}

function atPoint(a: Vec2, b: Vec2, eps = 4): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < eps;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[rng.int(0, items.length - 1)] ?? items[0]!;
}
