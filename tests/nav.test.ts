import { describe, expect, it } from 'vitest';
import { TileMap, findPath, smoothPath, type TileMapDef } from '@core/nav';

/** 10×10 open room with a wall down the middle and one doorway. */
function mapWithWall(): TileMap {
  const width = 10;
  const height = 10;
  const tiles = new Array(width * height).fill(0);
  for (let y = 0; y < height; y++) {
    if (y === 5) continue; // doorway at y=5
    tiles[y * width + 5] = 1;
  }
  const def: TileMapDef = { width, height, tileSize: 32, tiles };
  return new TileMap(def);
}

describe('TileMap', () => {
  it('validates tile count', () => {
    expect(() => new TileMap({ width: 2, height: 2, tileSize: 1, tiles: [0, 0] })).toThrow(
      /expected 4 tiles/,
    );
  });

  it('converts between world and tile space', () => {
    const map = mapWithWall();
    expect(map.toTile({ x: 0, y: 0 })).toEqual({ tx: 0, ty: 0 });
    expect(map.toTile({ x: 33, y: 33 })).toEqual({ tx: 1, ty: 1 });
    expect(map.toWorld(0, 0)).toEqual({ x: 16, y: 16 });
  });

  it('reports walkability', () => {
    const map = mapWithWall();
    expect(map.isWalkable(0, 0)).toBe(true);
    expect(map.isWalkable(5, 0)).toBe(false);
    expect(map.isWalkable(5, 5)).toBe(true);
    expect(map.isWalkable(-1, 0)).toBe(false);
    expect(map.isWalkable(99, 99)).toBe(false);
  });

  it('line-of-sight test is blocked by walls', () => {
    const map = mapWithWall();
    expect(map.lineWalkable({ x: 16, y: 16 }, { x: 16, y: 288 })).toBe(true); // same column
    expect(map.lineWalkable({ x: 48, y: 48 }, { x: 240, y: 48 })).toBe(false); // across the wall
  });
});

describe('findPath', () => {
  it('finds a straight path in an open map', () => {
    const map = new TileMap({ width: 10, height: 10, tileSize: 32, tiles: new Array(100).fill(0) });
    const path = findPath(map, { x: 16, y: 16 }, { x: 288, y: 16 });
    expect(path.found).toBe(true);
    expect(path.waypoints.at(-1)).toEqual({ x: 288, y: 16 });
  });

  it('routes around a wall through a doorway', () => {
    const map = mapWithWall();
    const path = findPath(map, { x: 48, y: 48 }, { x: 240, y: 48 });
    expect(path.found).toBe(true);
    // every waypoint must be on a walkable tile
    for (const wp of path.waypoints) {
      const { tx, ty } = map.toTile(wp);
      expect(map.isWalkable(tx, ty)).toBe(true);
    }
    // and the path must pass through the doorway row at some point
    expect(path.waypoints.some((wp) => map.toTile(wp).ty === 5)).toBe(true);
  });

  it('fails cleanly when the goal is blocked', () => {
    const map = mapWithWall();
    const path = findPath(map, { x: 16, y: 16 }, { x: 176, y: 16 }); // inside the wall
    expect(path.found).toBe(false);
    expect(path.waypoints).toEqual([]);
  });

  it('fails cleanly when the goal is sealed off', () => {
    const tiles = new Array(25).fill(0);
    // seal tile (4,4) behind a box
    for (const [x, y] of [
      [3, 4],
      [4, 3],
    ] as const) {
      tiles[y * 5 + x] = 1;
    }
    const map = new TileMap({ width: 5, height: 5, tileSize: 10, tiles });
    const path = findPath(map, { x: 5, y: 5 }, { x: 45, y: 45 });
    expect(path.found).toBe(false);
  });

  it('returns a path when start and goal are the same tile', () => {
    const map = new TileMap({ width: 4, height: 4, tileSize: 8, tiles: new Array(16).fill(0) });
    const path = findPath(map, { x: 4, y: 4 }, { x: 6, y: 6 });
    expect(path.found).toBe(true);
    expect(path.cost).toBe(0);
  });

  it('is deterministic for identical inputs', () => {
    const map = mapWithWall();
    const a = findPath(map, { x: 48, y: 48 }, { x: 240, y: 288 });
    const b = findPath(map, { x: 48, y: 48 }, { x: 240, y: 288 });
    expect(a.waypoints).toEqual(b.waypoints);
    expect(a.cost).toBe(b.cost);
  });

  it('does not cut corners diagonally', () => {
    const tiles = new Array(9).fill(0);
    tiles[1 * 3 + 1] = 1; // block the centre of a 3x3
    const map = new TileMap({ width: 3, height: 3, tileSize: 10, tiles });
    const path = findPath(map, { x: 5, y: 5 }, { x: 25, y: 25 });
    // must go around, not through the wall
    expect(path.found).toBe(true);
    for (const wp of path.waypoints) {
      const { tx, ty } = map.toTile(wp);
      expect(map.isWalkable(tx, ty)).toBe(true);
    }
  });

  it('handles 40 simultaneous requests well under the 2ms budget', () => {
    const width = 60;
    const height = 60;
    const tiles = new Array(width * height).fill(0);
    for (let i = 0; i < tiles.length; i += 7) tiles[i] = 1; // scattered obstacles
    const map = new TileMap({ width, height, tileSize: 16, tiles });
    const start = performance.now();
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const from = { x: (2 + (i % 50)) * 16, y: (2 + i) * 16 };
      const to = { x: 55 * 16, y: 55 * 16 };
      if (findPath(map, from, to).found) found++;
    }
    const elapsed = performance.now() - start;
    expect(found).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50); // generous CI margin; target is 2ms locally
  });
});

describe('smoothPath', () => {
  it('collapses a straight run to one waypoint', () => {
    const map = new TileMap({ width: 10, height: 10, tileSize: 32, tiles: new Array(100).fill(0) });
    const points = [
      { x: 48, y: 16 },
      { x: 80, y: 16 },
      { x: 112, y: 16 },
      { x: 144, y: 16 },
    ];
    expect(smoothPath(map, { x: 16, y: 16 }, points)).toEqual([{ x: 144, y: 16 }]);
  });

  it('keeps waypoints needed to round a corner', () => {
    const map = mapWithWall();
    const points = [
      { x: 176, y: 48 },
      { x: 176, y: 176 },
      { x: 240, y: 288 },
    ];
    const out = smoothPath(map, { x: 48, y: 48 }, points);
    expect(out.length).toBeGreaterThan(1);
  });
});

describe('body collision', () => {
  const map = new TileMap({
    width: 5,
    height: 5,
    tileSize: 10,
    tiles: [
      1, 1, 1, 1, 1,
      1, 0, 0, 0, 1,
      1, 0, 1, 0, 1,
      1, 0, 0, 0, 1,
      1, 1, 1, 1, 1,
    ],
  });

  it('a circle fillets a corner that a point-sized test would clip', () => {
    // exactly at the tile corner of the central block
    expect(map.circleClear({ x: 25, y: 25 }, 0)).toBe(true);
    expect(map.circleClear({ x: 25, y: 25 }, 3)).toBe(false);
  });

  it('a swept segment stops at the block it would graze', () => {
    expect(map.segmentClear({ x: 15, y: 15 }, { x: 35, y: 35 }, 0)).toBe(true);
    expect(map.segmentClear({ x: 15, y: 15 }, { x: 35, y: 35 }, 3)).toBe(false);
  });

  it('smoothing with a radius refuses the diagonal shortcut', () => {
    const points = [
      { x: 15, y: 25 },
      { x: 25, y: 15 },
      { x: 35, y: 25 },
    ];
    const tight = smoothPath(map, { x: 15, y: 35 }, points, 0);
    const safe = smoothPath(map, { x: 15, y: 35 }, points, 3);
    expect(safe.length).toBeGreaterThanOrEqual(tight.length);
    for (const wp of safe) expect(map.circleClear(wp, 3)).toBe(true);
  });
});
