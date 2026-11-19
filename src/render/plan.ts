/**
 * The incident plan: a top-down floor plan, drawn on a canvas, in the world's own
 * coordinates.
 *
 * Why a second renderer at all, when the street already has PixiJS? Because the
 * incident screen is a *document with a map in it*: it sits beside a form, it is
 * typed into, and it must never steal the text cursor. A canvas inside the DOM
 * layout is the honest tool for that, and it lets the plan be scaled to the panel
 * rather than to a window.
 *
 * The rule that matters is not the drawing technique, it is **what is drawn**:
 * an unknown room is walls and nothing else. A known room gets its contents. A
 * hiding subject is never drawn, which is how "clear is a claim" stays a claim
 * rather than a lie the renderer told you.
 */

import type { Incident, HostileState } from '@systems/tactical/incident';
import { heatBand, HEAT_RING } from '@systems/tactical/crowd';

const INK = '#c9d3dd';
const DIM = '#7f8d9b';
const FAINT = '#3b4652';
const GOLD = '#d8b06a';
const RED = '#c9705f';
const GREEN = '#a9c79a';
const WALL = '#2f3841';
const WALL_LIT = '#3d4954';
const FLOOR_KNOWN = 'rgba(36,42,49,.85)';
const FLOOR_UNKNOWN = 'rgba(18,22,26,.55)';

export interface PlanHandle {
  /** repaint from the current incident state */
  draw(): void;
  readonly canvas: HTMLCanvasElement;
  resize(cssWidth: number): void;
  destroy(): void;
}

export function createPlan(inc: Incident, cssWidth = 440): PlanHandle {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.imageRendering = 'pixelated';
  canvas.setAttribute('aria-label', 'floor plan');
  const ctx = canvas.getContext('2d');

  const map = inc.map;
  let width = cssWidth;

  function resize(next: number): void {
    width = next;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = width / (map.width * map.tileSize);
    const cssHeight = map.height * map.tileSize * scale;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx?.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  function draw(): void {
    if (!ctx) return;
    const t = map.tileSize;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = width / (map.width * map.tileSize);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, map.width * t, map.height * t);

    // floor pass, room by room, so the silhouette rule lives in one place
    for (const room of inc.json.rooms) {
      const known = inc.visibilities.get(room.id) === 'known';
      ctx.fillStyle = known ? FLOOR_KNOWN : FLOOR_UNKNOWN;
      ctx.fillRect(room.x * t, room.y * t, room.w * t, room.h * t);
      ctx.strokeStyle = known ? 'rgba(216,176,106,.4)' : 'rgba(127,141,155,.18)';
      ctx.lineWidth = known ? 2 : 1;
      ctx.setLineDash(known ? [] : [5, 5]);
      ctx.strokeRect(room.x * t + 1, room.y * t + 1, room.w * t - 2, room.h * t - 2);
      ctx.setLineDash([]);

      if (!known) {
        // a silhouette carries one architectural fact and nothing else
        const door = room.doors.map((id) => inc.doors.get(id)).find((d) => d !== undefined);
        if (door) {
          ctx.fillStyle = door.state === 'barred' ? RED : door.state === 'locked' ? GOLD : DIM;
          ctx.fillRect(door.x * t, door.y * t, t, t);
        }
      }
    }

    // walls on top, lit where a room is known
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.isWalkable(x, y)) continue;
        ctx.fillStyle = WALL;
        ctx.fillRect(x * t, y * t, t, t);
        ctx.fillStyle = WALL_LIT;
        ctx.fillRect(x * t, y * t, t, 4);
      }
    }

    // a cleared room gets a rule under its name: the claim, drawn
    for (const room of inc.json.rooms) {
      if (inc.visibilities.get(room.id) !== 'known') continue;
      const cleared = inc.clearClaims.get(room.id) === true;
      ctx.font = `600 ${t * 0.34}px ui-monospace, monospace`;
      ctx.fillStyle = cleared ? GREEN : GOLD;
      ctx.fillText(
        cleared ? `${room.label.toUpperCase()} · CLEAR` : room.label.toUpperCase(),
        room.x * t + 5,
        room.y * t + t * 0.55,
      );
    }

    // subjects: only the ones the scene has actually seen
    for (const h of inc.hostiles.values()) {
      if (!h.spotted || h.hiding) continue;
      drawHostile(ctx, h, t);
    }

    // officers
    if (inc.squad) {
      for (const unit of inc.squad.all()) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(unit.pos.x, unit.pos.y, t * 0.24, 0, Math.PI * 2);
        ctx.fill();
        // the facing wedge, because a unit that cannot see a corner matters
        ctx.strokeStyle = 'rgba(201,211,221,.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(unit.pos.x, unit.pos.y);
        ctx.lineTo(unit.pos.x + Math.cos(unit.facing) * t * 0.7, unit.pos.y + Math.sin(unit.facing) * t * 0.7);
        ctx.stroke();
      }
    }

    // the Warden, when solo
    ctx.fillStyle = GOLD;
    ctx.fillRect(inc.warden.x - t * 0.2, inc.warden.y - t * 0.2, t * 0.4, t * 0.4);
    if (inc.focusActive) {
      ctx.strokeStyle = 'rgba(216,176,106,.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(inc.warden.x, inc.warden.y, t * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawHostile(ctx: CanvasRenderingContext2D, h: HostileState, t: number): void {
    const colour =
      h.wound === 'dead' ? FAINT : h.detained ? GREEN : h.archetype === 'armed' ? RED : INK;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(h.pos.x, h.pos.y, t * 0.2, 0, Math.PI * 2);
    ctx.fill();
    if (h.archetype === 'armed') {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(h.pos.x, h.pos.y, t * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (h.detained) {
      ctx.strokeStyle = GREEN;
      ctx.beginPath();
      ctx.moveTo(h.pos.x - t * 0.16, h.pos.y);
      ctx.lineTo(h.pos.x + t * 0.16, h.pos.y);
      ctx.stroke();
    }
  }

  resize(cssWidth);
  draw();
  return { canvas, draw, resize, destroy: () => canvas.remove() };
}

/** The crowd's ground ring, in world units, for whichever renderer wants it. */
export function drawCrowdRing(
  ctx: CanvasRenderingContext2D,
  centre: { x: number; y: number },
  radius: number,
  heat: number,
  seconds: number,
): void {
  const band = heatBand(heat);
  const spec = HEAT_RING[band];
  const pulse = spec.pulse === 0 ? 0 : 1 + Math.sin(seconds * spec.pulse) * 0.06;
  ctx.save();
  ctx.globalAlpha = spec.alpha;
  ctx.fillStyle = spec.colour;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, radius * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, spec.alpha + 0.25);
  ctx.strokeStyle = spec.colour;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  void DIM;
}
