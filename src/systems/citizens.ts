/**
 * The Beat's population (P1-T02).
 *
 * Six citizens, one routine each, a `dread` value that changes what they do when
 * the Warden is near. The behavioural budget here is intentionally tiny — this
 * is a *street you recognise*, not a crowd sim. The thing that has to read is
 * "the nervous one is avoiding me", and that is one distance check and one
 * waypoint decision.
 *
 * Determinism: schedules are index-driven off the shift clock, and any choice is
 * drawn from the citizen's own RNG stream, which the save carries.
 */

import { findPath, type TileMap, type Vec2 } from '@core/nav';
import { streamFor, type Rng } from '@core/rng';
import type {
  CitizenAnswers,
  Irregularity,
  Papers,
  Temperament,
} from './inspection';
import type { Simulation } from './shift';

export interface PostDef {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface CitizenDef {
  id: string;
  name: string;
  archetype: string;
  post: string;
  temperament: Temperament;
  dread: number;
  papers: Papers;
  irregularity: Irregularity | null;
  /** what is actually true, per question id */
  true_answers: CitizenAnswers;
  knowledge: string[];
}

export interface CitizenComponents {
  citizenId: string;
  pos: Vec2;
  facing: number;
  /** current routine step index */
  step: number;
  route: Vec2[];
  routeIndex: number;
  /** true when the citizen is at a post rather than walking */
  settled: boolean;
  /** seconds until the citizen moves again */
  dwell: number;
  /** player-visible fear, 0–1 (dread adjusted by proximity) */
  fear: number;
  /** how many times this citizen has been inspected */
  inspections: number;
}

/** How close the Warden has to be before dread starts changing behaviour. */
export const FEAR_RADIUS = 5 * 32;
/** Extra seconds a frightened citizen spends hiding before moving on. */
export const FEAR_DWELL = 4;

export class Citizens {
  private readonly defs = new Map<string, CitizenDef>();
  private readonly posts = new Map<string, PostDef>();
  private readonly routines = new Map<string, string[]>();
  private readonly rngs = new Map<string, Rng>();

  constructor(
    private readonly sim: Simulation,
    private readonly map: TileMap,
    citizens: readonly CitizenDef[],
    posts: readonly PostDef[],
    routines: Record<string, string[]>,
    private readonly seed: number,
    private readonly shift: number,
  ) {
    for (const p of posts) this.posts.set(p.id, p);
    for (const c of citizens) {
      this.defs.set(c.id, c);
      this.routines.set(c.id, routines[c.post] ?? [c.post]);
      this.rngs.set(c.id, streamFor(seed, shift, `citizen:${c.id}`));
    }
    for (const c of citizens) this.spawn(c);
  }

  get all(): CitizenDef[] {
    return [...this.defs.values()];
  }

  def(id: string): CitizenDef | undefined {
    return this.defs.get(id);
  }

  post(id: string): PostDef | undefined {
    return this.posts.get(id);
  }

  /** World position of a citizen, for hover and interaction. */
  position(id: string): Vec2 | undefined {
    return this.sim.citizenState(id)?.pos;
  }

  /** The citizen nearest to a world point, within `radius`. */
  nearest(point: Vec2, radius = 40): CitizenDef | undefined {
    let best: CitizenDef | undefined;
    let bestDist = radius;
    for (const def of this.defs.values()) {
      const pos = this.position(def.id);
      if (!pos) continue;
      const d = Math.hypot(pos.x - point.x, pos.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        best = def;
      }
    }
    return best;
  }

  /** Back to their posts at the start of a new shift. */
  respawn(): void {
    for (const def of this.defs.values()) {
      this.spawn(def, true);
    }
  }

  private spawn(def: CitizenDef, replace = false): void {
    const post = this.posts.get(def.post);
    if (!post) return;
    const at = this.map.toWorld(post.x, post.y);
    if (replace) this.sim.removeCitizen(def.id);
    this.sim.addCitizen(def.id, {
      pos: { x: at.x, y: at.y },
      facing: 0,
      step: 0,
      route: [],
      routeIndex: 0,
      settled: true,
      // stagger the first move so the street does not breathe in unison
      dwell: 6 + (this.rngs.get(def.id)?.next() ?? 0.5) * 14,
      fear: Math.min(1, this.effectiveDread(def.id) * 0.5),
      inspections: 0,
    });
  }

  /**
   * One simulation step. Called by the shift loop, never by render.
   * `warden` is the player's position; passing it in keeps this testable.
   */
  /**
   * A household's grievance as a lift on its people's dread (P3-T01).
   *
   * Without this, the six individuals on the street are scenery that happens to be
   * attached to a district: a frightened man from a household the Cell has recruited
   * looks exactly like a frightened man from a quiet one. The base `dread` in the
   * authored cast is the *floor* — a person from a hardened household cannot be calm,
   * whatever their temperament says.
   *
   * Set by the shift when the district changes; absent means the authored values
   * stand, which keeps the pure Phase 1 slice working.
   */
  private dreadLift = new Map<string, number>();

  setDreadLift(byCitizen: ReadonlyMap<string, number>): void {
    this.dreadLift = new Map(byCitizen);
  }

  /**
   * The dread this citizen is actually carrying.
   *
   * With no district the authored value is returned *unchanged* — the Phase 1 slice
   * must not quietly become a calmer place because Phase 3 introduced a lift. With a
   * district, the household's mood is added to the authored base and clamped.
   */
  effectiveDread(id: string): number {
    const base = this.defs.get(id)?.dread ?? 0.3;
    const lift = this.dreadLift.get(id);
    if (lift === undefined) return base;
    return Math.min(1, base + lift);
  }

  step(dt: number, warden: Vec2): void {
    for (const def of this.defs.values()) {
      const state = this.sim.citizenState(def.id);
      if (!state) continue;
      const rng = this.rngs.get(def.id)!;

      // fear tracks distance to the Warden, floored at the citizen's baseline
      const dist = Math.hypot(state.pos.x - warden.x, state.pos.y - warden.y);
      const proximity = Math.max(0, 1 - dist / FEAR_RADIUS);
      const dread = this.effectiveDread(def.id);
      const target = Math.min(1, dread * 0.6 + proximity * (0.4 + dread * 0.6));
      state.fear += (target - state.fear) * Math.min(1, dt * 0.8);

      // moving?
      if (state.routeIndex < state.route.length) {
        const wp = state.route[state.routeIndex]!;
        const travel = 1.7 * this.map.tileSize * dt * (1 - state.fear * 0.35);
        const dx = wp.x - state.pos.x;
        const dy = wp.y - state.pos.y;
        const d = Math.hypot(dx, dy);
        if (d <= travel) {
          state.pos.x = wp.x;
          state.pos.y = wp.y;
          state.routeIndex += 1;
          if (state.routeIndex >= state.route.length) {
            state.route = [];
            state.routeIndex = 0;
            state.settled = true;
            state.dwell = 8 + rng.next() * 10 + state.fear * FEAR_DWELL;
          }
        } else {
          state.pos.x += (dx / d) * travel;
          state.pos.y += (dy / d) * travel;
          state.facing = Math.atan2(dy, dx);
        }
        continue;
      }

      // waiting?
      state.dwell -= dt;
      if (state.dwell > 0) continue;

      // choose the next post
      const routine = this.routines.get(def.id) ?? [def.post];
      let nextStep = (state.step + 1) % routine.length;
      let nextPost = routine[nextStep]!;

      // dread: a frightened citizen skips the post nearest the Warden
      if (state.fear > 0.55 && routine.length > 2 && rng.chance(0.6)) {
        const candidate = routine[nextStep]!;
        const cpost = this.posts.get(candidate);
        if (cpost) {
          const cw = this.map.toWorld(cpost.x, cpost.y);
          const tooClose = Math.hypot(cw.x - warden.x, cw.y - warden.y) < FEAR_RADIUS * 1.4;
          if (tooClose) {
            nextStep = (nextStep + 1) % routine.length;
            nextPost = routine[nextStep]!;
            this.sim.emit('citizen:avoided', { citizen: def.id, post: candidate });
          }
        }
      }

      const post = this.posts.get(nextPost);
      if (!post) continue;
      const goal = this.map.toWorld(post.x, post.y);
      const path = findPath(this.map, state.pos, goal, { radius: 0.3 * this.map.tileSize });
      if (!path.found || path.waypoints.length === 0) {
        state.dwell = 2; // could not route; try again shortly, never spin
        continue;
      }
      state.step = nextStep;
      state.route = path.waypoints;
      state.routeIndex = 0;
      state.settled = false;
    }
  }
}
