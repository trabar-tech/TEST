/**
 * Tilemap collision, navmesh grid and A* pathfinding.
 *
 * Budget (P0-T05): 40 simultaneous path requests in under 2 ms on the
 * reference machine. Implemented with a binary heap and a flat typed array
 * grid — no object churn per node.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface TileMapDef {
  width: number;
  height: number;
  /** tile size in world units (pixels at zoom 1) */
  tileSize: number;
  /** 0 = walkable, non-zero = blocked. Row-major, length = width*height. */
  tiles: number[];
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly blocked: Uint8Array;

  constructor(def: TileMapDef) {
    if (def.tiles.length !== def.width * def.height) {
      throw new Error(
        `tilemap: expected ${def.width * def.height} tiles, got ${def.tiles.length}`,
      );
    }
    this.width = def.width;
    this.height = def.height;
    this.tileSize = def.tileSize;
    this.blocked = new Uint8Array(def.tiles.length);
    for (let i = 0; i < def.tiles.length; i++) this.blocked[i] = def.tiles[i] ? 1 : 0;
  }

  index(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  isWalkable(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && this.blocked[this.index(tx, ty)] === 0;
  }

  /** world → tile */
  toTile(p: Vec2): { tx: number; ty: number } {
    return { tx: Math.floor(p.x / this.tileSize), ty: Math.floor(p.y / this.tileSize) };
  }

  /** tile → world centre */
  toWorld(tx: number, ty: number): Vec2 {
    return { x: (tx + 0.5) * this.tileSize, y: (ty + 0.5) * this.tileSize };
  }

  /**
   * Is a circular body of `radius` centred at `p` clear of walls?
   *
   * Bresenham on tile centres says a line is walkable even when it squeezes
   * exactly between two diagonal corners — which is precisely the case where a
   * pawn visibly clips geometry. Collision is therefore defined on the body's
   * bounding box, and path smoothing uses this, not the centre line.
   */
  circleClear(p: Vec2, radius: number): boolean {
    const minX = Math.floor((p.x - radius) / this.tileSize);
    const maxX = Math.floor((p.x + radius) / this.tileSize);
    const minY = Math.floor((p.y - radius) / this.tileSize);
    const maxY = Math.floor((p.y + radius) / this.tileSize);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!this.isWalkable(tx, ty)) {
          // a corner tile only blocks if the circle actually reaches it
          const nx = Math.max(tx * this.tileSize, Math.min(p.x, (tx + 1) * this.tileSize));
          const ny = Math.max(ty * this.tileSize, Math.min(p.y, (ty + 1) * this.tileSize));
          if ((nx - p.x) ** 2 + (ny - p.y) ** 2 < radius * radius) return false;
        }
      }
    }
    return true;
  }

  /** Swept version of `circleClear` along a segment, sampled at quarter tiles. */
  segmentClear(a: Vec2, b: Vec2, radius: number): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, this.tileSize / 4);
    const n = Math.ceil(dist / step);
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      if (!this.circleClear({ x: a.x + dx * t, y: a.y + dy * t }, radius)) return false;
    }
    return true;
  }

  /** Straight-line walkability test on the tile grid (Bresenham). */
  lineWalkable(a: Vec2, b: Vec2): boolean {
    const s = this.toTile(a);
    const e = this.toTile(b);
    let x = s.tx;
    let y = s.ty;
    const dx = Math.abs(e.tx - x);
    const dy = Math.abs(e.ty - y);
    const sx = x < e.tx ? 1 : -1;
    const sy = y < e.ty ? 1 : -1;
    let err = dx - dy;
    // guard: pathological loops
    for (let guard = 0; guard < 10000; guard++) {
      if (!this.isWalkable(x, y)) return false;
      if (x === e.tx && y === e.ty) return true;
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
    return false;
  }
}

/* --------------------------------------------------------------- A* search */

/**
 * Binary min-heap over (node, f-score) pairs, backed by typed arrays.
 * Plain number[] heaps showed up as the single hottest frame cost in the
 * 40-path profile (boxing + array growth), so capacity is fixed and grown by
 * doubling.
 */
class MinHeap {
  private nodes: Int32Array;
  private scores: Float32Array;
  private length = 0;

  constructor(capacity = 1024) {
    this.nodes = new Int32Array(capacity);
    this.scores = new Float32Array(capacity);
  }

  get size(): number {
    return this.length;
  }

  clear(): void {
    this.length = 0;
  }

  push(node: number, score: number): void {
    if (this.length === this.nodes.length) this.grow();
    let i = this.length++;
    this.nodes[i] = node;
    this.scores[i] = score;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent]! <= this.scores[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0]!;
    const last = this.length - 1;
    this.nodes[0] = this.nodes[last]!;
    this.scores[0] = this.scores[last]!;
    this.length = last;
    if (last > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= this.length) break;
        const r = l + 1;
        const smallest =
          r < this.length && this.scores[r]! < this.scores[l]! ? r : l;
        if (this.scores[smallest]! >= this.scores[i]!) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private grow(): void {
    const nodes = new Int32Array(this.nodes.length * 2);
    const scores = new Float32Array(this.scores.length * 2);
    nodes.set(this.nodes);
    scores.set(this.scores);
    this.nodes = nodes;
    this.scores = scores;
  }

  private swap(a: number, b: number): void {
    const n = this.nodes[a]!;
    this.nodes[a] = this.nodes[b]!;
    this.nodes[b] = n;
    const s = this.scores[a]!;
    this.scores[a] = this.scores[b]!;
    this.scores[b] = s;
  }
}

/**
 * Scratch buffers, reused across calls. Allocating three typed arrays per
 * request cost more than the search itself at 40 requests/frame; the pool is
 * reset with a generation stamp so `fill()` never runs in the hot path.
 */
interface Scratch {
  size: number;
  gScore: Float32Array;
  cameFrom: Int32Array;
  closedGen: Uint32Array;
  openGen: Uint32Array;
  gen: number;
  heap: MinHeap;
}

let scratch: Scratch | null = null;

function getScratch(size: number): Scratch {
  if (!scratch || scratch.size !== size) {
    scratch = {
      size,
      gScore: new Float32Array(size),
      cameFrom: new Int32Array(size),
      closedGen: new Uint32Array(size),
      openGen: new Uint32Array(size),
      gen: 0,
      heap: new MinHeap(Math.min(size, 4096)),
    };
  }
  const s = scratch;
  s.gen += 1;
  if (s.gen > 0xfffe_fffe) {
    s.closedGen.fill(0);
    s.openGen.fill(0);
    s.gen = 1;
  }
  s.heap.clear();
  return s;
}

const NEIGH_DX = [0, 1, 0, -1, 1, 1, -1, -1] as const;
const NEIGH_DY = [-1, 0, 1, 0, -1, 1, 1, -1] as const;

export interface PathResult {
  /** world-space waypoints, excluding the start, including the goal */
  waypoints: Vec2[];
  /** total cost in tiles (diagonal = √2) */
  cost: number;
  found: boolean;
}

/**
 * A* on the tile grid with 8-way movement and no corner cutting.
 * Deterministic: neighbour order and tie-breaking are fixed.
 */
export function findPath(
  map: TileMap,
  from: Vec2,
  to: Vec2,
  opts: { maxNodes?: number; radius?: number } = {},
): PathResult {
  const radius = opts.radius ?? 0;
  const start = map.toTile(from);
  const goal = map.toTile(to);
  const maxNodes = opts.maxNodes ?? 20000;

  if (!map.isWalkable(goal.tx, goal.ty)) return { waypoints: [], cost: 0, found: false };
  if (start.tx === goal.tx && start.ty === goal.ty) {
    return { waypoints: [map.toWorld(goal.tx, goal.ty)], cost: 0, found: true };
  }

  const n = map.width * map.height;
  const s = getScratch(n);
  const { gScore, cameFrom, closedGen, openGen, heap: open } = s;
  const gen = s.gen;

  const startIdx = map.index(start.tx, start.ty);
  const goalIdx = map.index(goal.tx, goal.ty);
  gScore[startIdx] = 0;
  closedGen[startIdx] = 0;
  cameFrom[startIdx] = -1;
  open.push(startIdx, heuristic(start.tx, start.ty, goal.tx, goal.ty));
  openGen[startIdx] = gen;

  const W = map.width;
  const blocked = map.blocked;
  let visited = 0;
  const SQRT2 = Math.SQRT2;

  while (open.size > 0) {
    const current = open.pop();
    if (current === goalIdx) break;
    if (closedGen[current] === gen) continue;
    closedGen[current] = gen;
    if (++visited > maxNodes) break;

    const cx = current % W;
    const cy = (current - cx) / W;
    const g = gScore[current]!;

    // fixed neighbour order (N, E, S, W, NE, SE, SW, NW) for determinism
    for (let d = 0; d < 8; d++) {
      const dx = NEIGH_DX[d]!;
      const dy = NEIGH_DY[d]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      const nIdx = ny * W + nx;
      if (blocked[nIdx]) continue;
      // no corner cutting on diagonals
      if (d >= 4 && (blocked[cy * W + nx] || blocked[ny * W + cx])) continue;
      if (closedGen[nIdx] === gen) continue;
      const cost = d >= 4 ? SQRT2 : 1;
      const tentative = g + cost;
      const known = openGen[nIdx] === gen;
      if (known && tentative >= gScore[nIdx]!) continue;
      gScore[nIdx] = tentative;
      cameFrom[nIdx] = current;
      openGen[nIdx] = gen;
      const hx = nx > goal.tx ? nx - goal.tx : goal.tx - nx;
      const hy = ny > goal.ty ? ny - goal.ty : goal.ty - ny;
      open.push(nIdx, tentative + hx + hy + (SQRT2 - 2) * (hx < hy ? hx : hy));
    }
  }

  if (openGen[goalIdx] !== gen && goalIdx !== startIdx) {
    return { waypoints: [], cost: 0, found: false };
  }

  // reconstruct
  const tiles: number[] = [];
  let cur = goalIdx;
  while (cur !== -1 && cur !== startIdx) {
    tiles.push(cur);
    cur = cameFrom[cur]!;
  }
  tiles.reverse();
  const world = tiles.map((idx) => {
    const tx = idx % map.width;
    const ty = (idx - tx) / map.width;
    return map.toWorld(tx, ty);
  });
  // always end exactly on the requested point
  world[world.length - 1] = { x: to.x, y: to.y };
  return { waypoints: smoothPath(map, from, world, radius), cost: gScore[goalIdx]!, found: true };
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  // octile distance
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Remove waypoints that are visible from the previous kept point ("string
 * pulling"). Keeps the path tight without a full funnel algorithm.
 */
/** How far ahead the string-puller may look. Unbounded search made smoothing
 *  quadratic in path length and dominated the 40-path budget. */
const SMOOTH_LOOKAHEAD = 24;

export function smoothPath(map: TileMap, from: Vec2, points: Vec2[], radius = 0): Vec2[] {
  if (points.length <= 2) return points;
  const out: Vec2[] = [];
  let anchor = from;
  let i = 0;
  while (i < points.length) {
    let furthest = i;
    const lowest = Math.max(i, points.length - SMOOTH_LOOKAHEAD);
    for (let j = points.length - 1; j > lowest; j--) {
      const candidate = points[j]!;
      const clear = radius > 0 ? map.segmentClear(anchor, candidate, radius) : map.lineWalkable(anchor, candidate);
      if (clear) {
        furthest = j;
        break;
      }
    }
    out.push(points[furthest]!);
    anchor = points[furthest]!;
    i = furthest + 1;
  }
  return out;
}
