/**
 * PixiJS 8 scene for Phase 0: a tile grid, a pawn, a click-order marker.
 *
 * Render is read-only with respect to the simulation. It reads `Sim` state each
 * frame and never writes to it (ADR-0001: one-way dependency, core → render).
 * All movement is in sim units; the camera only scales and offsets.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Sim } from '@systems/sim';
import type { Vec2 } from '@core/nav';
import { fitCamera, screenToWorld, type Camera } from './camera';

const COLORS = {
  floor: 0x1b1f24,
  floorAlt: 0x20252b,
  grout: 0x11151a,
  wall: 0x2f3841,
  wallTop: 0x3d4954,
  pawn: 0xd8dee6,
  pawnMask: 0x8b1f29,
  path: 0x6f8fa8,
  cursor: 0xd8a85a,
  cursorBad: 0xa8493f,
};

export interface SceneHandle {
  /** which renderer is live; shown in the debug panel so a silent fallback is visible */
  readonly backend: 'webgl' | 'canvas2d';
  resize(width: number, height: number): void;
  /** draw one frame from current sim state */
  draw(sim: Sim, opts: { cursor: Vec2 | null; cursorValid: boolean }): void;
  /** viewport CSS pixel → world units, using the live camera */
  toWorld(clientX: number, clientY: number): Vec2;
  destroy(): void;
}

export async function createScene(sim: Sim, host: HTMLElement): Promise<SceneHandle> {
  const app = new Application();
  await app.init({
    background: 0x0d1013,
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    resizeTo: host,
    preference: 'webgl',
  });
  host.appendChild(app.canvas);
  app.canvas.style.display = 'block';
  app.canvas.setAttribute('aria-label', 'Sector 4 — Kiln Row');

  const world = new Container();
  app.stage.addChild(world);

  const grid = new Graphics();
  const pathLayer = new Graphics();
  const markerLayer = new Graphics();
  const pawnLayer = new Container();
  world.addChild(grid, pathLayer, markerLayer, pawnLayer);

  const pawnBody = new Graphics();
  const pawnLabel = new Text({
    text: 'RENNER',
    style: { fontFamily: 'monospace', fontSize: 9, fill: 0x9aa4ae, letterSpacing: 1 },
  });
  pawnLayer.addChild(pawnBody, pawnLabel);

  const { map } = sim;
  const t = map.tileSize;

  /* ground pass is static: draw once */
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const blocked = !map.isWalkable(x, y);
      const px = x * t;
      const py = y * t;
      if (blocked) {
        grid.rect(px, py, t, t).fill({ color: COLORS.wall });
        grid.rect(px, py, t, 4).fill({ color: COLORS.wallTop });
      } else {
        const alt = (x + y) % 2 === 0;
        grid.rect(px, py, t, t).fill({ color: alt ? COLORS.floor : COLORS.floorAlt });
        grid.rect(px, py, t, 1).fill({ color: COLORS.grout, alpha: 0.6 });
      }
    }
  }

  let cam: Camera = fitCamera(map, host.clientWidth, host.clientHeight);

  return {
    backend: 'webgl' as const,

    resize(width, height) {
      cam = fitCamera(map, width, height);
      world.scale.set(cam.scale);
      world.position.set(cam.ox, cam.oy);
    },

    toWorld(clientX, clientY) {
      const rect = app.canvas.getBoundingClientRect();
      return screenToWorld(cam, clientX - rect.left, clientY - rect.top);
    },

    draw(current, opts) {
      const pos = current.position;

      /* pawn */
      pawnBody.clear();
      const r = t * 0.34;
      pawnBody.circle(0, 0, r).fill({ color: COLORS.pawn });
      pawnBody.circle(0, 0, r * 0.62).fill({ color: COLORS.pawnMask });
      // facing wedge
      pawnBody
        .moveTo(Math.cos(current.heading) * r * 0.2, Math.sin(current.heading) * r * 0.2)
        .lineTo(Math.cos(current.heading) * r * 1.5, Math.sin(current.heading) * r * 1.5)
        .stroke({ color: COLORS.pawn, width: 2 });
      pawnLayer.position.set(pos.x, pos.y);
      pawnLabel.position.set(-pawnLabel.width / 2, r + 4);

      /* click marker */
      markerLayer.clear();
      if (opts.cursor) {
        const c = opts.cursorValid ? COLORS.cursor : COLORS.cursorBad;
        const s = t * 0.28;
        markerLayer
          .moveTo(opts.cursor.x - s, opts.cursor.y)
          .lineTo(opts.cursor.x + s, opts.cursor.y)
          .moveTo(opts.cursor.x, opts.cursor.y - s)
          .lineTo(opts.cursor.x, opts.cursor.y + s)
          .stroke({ color: c, width: 1.5, alpha: 0.9 });
      }

      /* remaining path, as a faint line so ordering reads clearly */
      pathLayer.clear();
      if (current.isMoving) {
        pathLayer.moveTo(pos.x, pos.y);
        for (const wp of current.remainingPath) pathLayer.lineTo(wp.x, wp.y);
        pathLayer.stroke({ color: COLORS.path, width: 1.5, alpha: 0.5 });
      }
    },

    destroy() {
      app.destroy(true, { children: true });
    },
  };
}
