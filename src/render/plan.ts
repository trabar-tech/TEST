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
  resize(cssWidth: number, cssHeight?: number): void;
  /**
   * Pointer → world.
   *
   * Lives here rather than in the view because only the renderer knows the camera. The view
   * used to assume "the whole map fits the canvas", which stops being true the moment the
   * camera exists — aiming would silently point at the wrong wall.
   */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number };
  destroy(): void;
}

export interface PlanOptions {
  /**
   * Full-screen mode: the canvas fills its box and the camera follows the Warden at a fixed
   * zoom, clamped to the building.
   *
   * The panel mode (the default) squeezes the whole floor into 440px, which is right for a
   * document and wrong for a shooter — you cannot aim at something you need a magnifier to
   * see. Playtest 2 named the gap; this is the switch between the two readings of the same
   * map, not a second renderer.
   */
  camera?: boolean;
  /** pixels per tile in camera mode (24 is a comfortable corridor width) */
  zoom?: number;
}

export function createPlan(inc: Incident, cssWidth = 440, opts: PlanOptions = {}): PlanHandle {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.imageRendering = 'pixelated';
  canvas.setAttribute('aria-label', 'floor plan');
  const ctx = canvas.getContext('2d');

  const map = inc.map;
  let width = cssWidth;

  let height = 0;

  function resize(next: number, nextHeight?: number): void {
    width = next;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (opts.camera) {
      height = nextHeight ?? Math.round(window.innerHeight * 0.72);
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      return;
    }
    const scale = width / (map.width * map.tileSize);
    const cssHeight = map.height * map.tileSize * scale;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx?.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  /** Camera centre in world units, clamped so the building never leaves the screen. */
  function cameraCentre(): { x: number; y: number } {
    const zoom = opts.zoom ?? 24;
    const viewW = width / zoom;
    const viewH = height / zoom;
    const worldW = map.width * map.tileSize;
    const worldH = map.height * map.tileSize;
    const clampAxis = (c: number, view: number, world: number): number =>
      view >= world ? world / 2 : Math.min(world - view / 2, Math.max(view / 2, c));
    return {
      x: clampAxis(inc.warden.x, viewW, worldW),
      y: clampAxis(inc.warden.y, viewH, worldH),
    };
  }

  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if (opts.camera) {
      const zoom = opts.zoom ?? 24;
      const c = cameraCentre();
      return {
        x: c.x + (clientX - rect.left - rect.width / 2) / zoom,
        y: c.y + (clientY - rect.top - rect.height / 2) / zoom,
      };
    }
    const w = rect.width || width;
    const scaleX = (map.width * map.tileSize) / w;
    const scaleY = (map.height * map.tileSize) / (rect.height || 1);
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function draw(): void {
    if (!ctx) return;
    const t = map.tileSize;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (opts.camera) {
      const zoom = opts.zoom ?? 24;
      const c = cameraCentre();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(
        dpr * zoom,
        0,
        0,
        dpr * zoom,
        dpr * (width / 2 - c.x * zoom),
        dpr * (height / 2 - c.y * zoom),
      );
    } else {
      const scale = width / (map.width * map.tileSize);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ctx.clearRect(0, 0, map.width * t, map.height * t);
    }

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

    // the Warden, when solo — with a facing line, because a shooter you cannot aim is a cursor
    if (!inc.hasSquad) {
      ctx.strokeStyle = inc.aimLineBlocked ? 'rgba(201,112,95,.55)' : 'rgba(216,176,106,.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(inc.warden.x, inc.warden.y);
      // an injured Warden's hands shake: the line wobbles more with every hit, so the player
      // can see the cost of a wound rather than read it off a pip
      const shake = inc.wardenWound * 0.16 * Math.sin(inc.simSeconds * 11);
      const aimAt = inc.aim + shake;
      ctx.lineTo(inc.warden.x + Math.cos(aimAt) * t * 3.2, inc.warden.y + Math.sin(aimAt) * t * 3.2);
      ctx.stroke();
    }
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
  return { canvas, draw, resize, screenToWorld, destroy: () => canvas.remove() };
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
