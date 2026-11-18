/**
 * One camera transform, shared by every renderer.
 *
 * Click-to-move inverts this transform; when the fit math lived in two places
 * (scene + input handler) a change to the margin silently desynced the cursor
 * from the pawn. It lives here once, and both renderers read it.
 */

import type { TileMap, Vec2 } from '@core/nav';

export interface Camera {
  scale: number;
  /** offset of world (0,0) in CSS pixels */
  ox: number;
  oy: number;
}

/** Fit the whole map into the viewport with a small margin, never cropping. */
export function fitCamera(map: TileMap, width: number, height: number, margin = 0.94): Camera {
  if (width <= 0 || height <= 0) return { scale: 1, ox: 0, oy: 0 };
  const worldW = map.width * map.tileSize;
  const worldH = map.height * map.tileSize;
  const scale = Math.max(0.25, Math.min(width / worldW, height / worldH) * margin);
  return {
    scale,
    ox: (width - worldW * scale) / 2,
    oy: (height - worldH * scale) / 2,
  };
}

/** viewport CSS pixels → world units */
export function screenToWorld(cam: Camera, x: number, y: number): Vec2 {
  return { x: (x - cam.ox) / cam.scale, y: (y - cam.oy) / cam.scale };
}
