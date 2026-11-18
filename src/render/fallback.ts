/**
 * Canvas2D renderer — the same scene drawn without WebGL.
 *
 * Not a nicety: the game is browser-only and will be played on locked-down
 * corporate laptops, in VMs, and inside sandboxed preview iframes where WebGL
 * is often unavailable. A WebGL-only build shows a stuck boot screen in exactly
 * those places. This renderer is deliberately dumb and shares the camera and
 * the sim with the Pixi path, so the two cannot disagree about where a click
 * lands.
 */

import type { Vec2 } from '@core/nav';
import { fitCamera, screenToWorld, type Camera } from './camera';
import type { SceneHandle, Renderable } from './scene';

const FLOOR = '#1b1f24';
const FLOOR_ALT = '#20252b';
const WALL = '#2f3841';
const WALL_TOP = '#3d4954';
const PAWN = '#d8dee6';
const MASK = '#8b1f29';
const PATH = '#6f8fa8';
const CURSOR = '#d8a85a';
const CURSOR_BAD = '#a8493f';

export function createFallbackScene(sim: Renderable, host: HTMLElement): SceneHandle {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.setAttribute('aria-label', 'Sector 4 — Kiln Row');
  host.appendChild(canvas);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('neither WebGL nor Canvas2D is available in this browser');

  const { map } = sim;
  const t = map.tileSize;
  let cam: Camera = fitCamera(map, host.clientWidth, host.clientHeight);
  let dpr = 1;

  function resize(width: number, height: number): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    cam = fitCamera(map, width, height);
  }
  resize(host.clientWidth, host.clientHeight);

  function draw(current: Renderable, opts: { cursor: Vec2 | null; cursorValid: boolean }): void {
    if (!g) return;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d1013';
    g.fillRect(0, 0, cssW, cssH);
    g.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, dpr * cam.ox, dpr * cam.oy);

    // ground, drawn every frame: simple enough that tracking dirty rects would
    // cost more than it saves at this map size
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.isWalkable(x, y)) {
          g.fillStyle = (x + y) % 2 === 0 ? FLOOR : FLOOR_ALT;
          g.fillRect(x * t, y * t, t, t);
        } else {
          g.fillStyle = WALL;
          g.fillRect(x * t, y * t, t, t);
          g.fillStyle = WALL_TOP;
          g.fillRect(x * t, y * t, t, 4);
        }
      }
    }

    for (const cam of current.cameras) {
      g.fillStyle = 'rgba(111,143,168,.06)';
      g.fillRect(cam.x * t, cam.y * t, cam.w * t, cam.h * t);
      g.strokeStyle = 'rgba(111,143,168,.3)';
      g.lineWidth = 1;
      g.strokeRect(cam.x * t, cam.y * t, cam.w * t, cam.h * t);
    }

    for (const c of current.citizenRoster) {
      const cp = current.citizenPosition(c.id);
      if (!cp) continue;
      const fear = current.citizenFear(c.id);
      const r = t * 0.26;
      g.fillStyle = '#9fb0c0';
      g.beginPath();
      g.arc(cp.x, cp.y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = fear > 0.62 ? MASK : '#4c5a68';
      g.beginPath();
      g.arc(cp.x, cp.y, r * 0.55, 0, Math.PI * 2);
      g.fill();
      if (current.hoveredCitizenId === c.id) {
        g.strokeStyle = CURSOR;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(cp.x, cp.y, r * 1.9, 0, Math.PI * 2);
        g.stroke();
      }
    }

    const pos = current.position;

    if (current.isMoving) {
      g.strokeStyle = PATH;
      g.globalAlpha = 0.5;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(pos.x, pos.y);
      for (const wp of current.remainingPath) g.lineTo(wp.x, wp.y);
      g.stroke();
      g.globalAlpha = 1;
    }

    if (opts.cursor) {
      g.strokeStyle = opts.cursorValid ? CURSOR : CURSOR_BAD;
      g.lineWidth = 1.5;
      const s = t * 0.28;
      g.beginPath();
      g.moveTo(opts.cursor.x - s, opts.cursor.y);
      g.lineTo(opts.cursor.x + s, opts.cursor.y);
      g.moveTo(opts.cursor.x, opts.cursor.y - s);
      g.lineTo(opts.cursor.x, opts.cursor.y + s);
      g.stroke();
    }

    const r = t * 0.34;
    g.fillStyle = PAWN;
    g.beginPath();
    g.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = MASK;
    g.beginPath();
    g.arc(pos.x, pos.y, r * 0.62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PAWN;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(pos.x, pos.y);
    g.lineTo(pos.x + Math.cos(current.heading) * r * 1.5, pos.y + Math.sin(current.heading) * r * 1.5);
    g.stroke();
  }

  return {
    backend: 'canvas2d',
    resize,
    draw,
    toWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return screenToWorld(cam, clientX - rect.left, clientY - rect.top);
    },
    destroy() {
      canvas.remove();
    },
  };
}
