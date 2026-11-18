/**
 * Camera math is shared by both renderers and by click-to-move, so a mistake
 * here is felt as "clicking doesn't move the pawn where I clicked" — the kind of
 * bug that reads as bad pathfinding and gets debugged in the wrong place.
 */

import { describe, expect, it } from 'vitest';
import { TileMap } from '@core/nav';
import { fitCamera, screenToWorld } from '@render/camera';

const map = new TileMap({
  width: 28,
  height: 20,
  tileSize: 32,
  tiles: new Array(28 * 20).fill(0),
});

describe('camera', () => {
  it('fits the whole map inside a wide viewport and centres it', () => {
    const cam = fitCamera(map, 1000, 400);
    expect(cam.scale).toBeCloseTo((400 / (20 * 32)) * 0.94, 6);
    // the height is the binding dimension, so the 6% margin shows up as a
    // small top/bottom inset and a much larger left/right one
    expect(cam.oy).toBeCloseTo(400 * 0.03, 6);
    expect(cam.ox).toBeGreaterThan(cam.oy * 5);
  });

  it('fits a tall viewport by the width instead', () => {
    const cam = fitCamera(map, 400, 2000);
    expect(cam.scale).toBeCloseTo((400 / (28 * 32)) * 0.94, 6);
    expect(cam.oy).toBeGreaterThan(cam.ox * 5);
  });

  it('never scales below a usable floor on a tiny viewport', () => {
    const cam = fitCamera(map, 40, 40);
    expect(cam.scale).toBeGreaterThanOrEqual(0.25);
  });

  it('screen → world → screen round-trips', () => {
    const cam = fitCamera(map, 1280, 800);
    for (const [sx, sy] of [
      [0, 0],
      [640, 400],
      [1279, 799],
    ] as const) {
      const w = screenToWorld(cam, sx, sy);
      expect(w.x * cam.scale + cam.ox).toBeCloseTo(sx, 6);
      expect(w.y * cam.scale + cam.oy).toBeCloseTo(sy, 6);
    }
  });

  it('the centre of the viewport maps to the centre of the map', () => {
    const cam = fitCamera(map, 1280, 800);
    const w = screenToWorld(cam, 640, 400);
    expect(w.x).toBeCloseTo((28 * 32) / 2, 6);
    expect(w.y).toBeCloseTo((20 * 32) / 2, 6);
  });
});
