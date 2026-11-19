/**
 * P2-T01 acceptance: the entry catalogue is data, its numbers are the design, and
 * noise is derivable from the log rather than asserted by the game.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import {
  ENTRY_METHODS,
  applyEntry,
  canBreach,
  countListeners,
  entrySpec,
  propagates,
} from '@systems/tactical/doors';
import type { DoorDef, InteriorMapJson } from '@systems/tactical/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const interior = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/interior_flat14.json'), 'utf8'),
) as MapJson & InteriorMapJson;
const map = new TileMap(mapJsonToDef(interior));

const door = (over: Partial<DoorDef> = {}): DoorDef => ({
  id: 'd_test',
  x: 7,
  y: 9,
  state: 'closed',
  rooms: ['north', 'hall'],
  appearance: 'plain',
  ...over,
});

describe('the entry catalogue', () => {
  it('is ordered quietest to loudest, and the quiet ones are slower', () => {
    for (let i = 1; i < ENTRY_METHODS.length; i++) {
      // ordering by noise is a design statement, so assert it rather than trust it
      expect(ENTRY_METHODS[i]!.noiseRadius).toBeGreaterThanOrEqual(ENTRY_METHODS[i - 1]!.noiseRadius);
    }
    const quiet = entrySpec('knock_talk');
    const loud = entrySpec('shotgun');
    expect(quiet.time).toBeGreaterThan(loud.time);
    expect(quiet.noiseRadius).toBeLessThan(loud.noiseRadius);
    expect(quiet.damage).toBe(0);
    expect(loud.damage).toBe(3);
  });

  it('produces the documented noise radius for every method (table test)', () => {
    const table: Array<[Parameters<typeof entrySpec>[0], number]> = [
      ['knock_talk', 2],
      ['roof_window', 3],
      ['shout_out', 4],
      ['stack_enter', 5],
      ['gas_wait', 6],
      ['split_entry', 7],
      ['ram', 9],
      ['shotgun', 13],
    ];
    for (const [method, radius] of table) {
      const d = door({ state: 'closed' });
      const res = applyEntry(d, method, 2);
      expect(res.ok, method).toBe(true);
      expect(res.noise!.radius, method).toBe(radius);
    }
  });

  it('knock & talk never damages the door', () => {
    const res = applyEntry(door(), 'knock_talk', 1);
    expect(res.ok).toBe(true);
    expect(res.damage).toBe(0);
    expect(res.door.state).toBe('open');
  });

  it('a barred door resists everything but the loud options', () => {
    const barred = door({ state: 'barred' });
    expect(canBreach('barred', 'knock_talk')).toBe(false);
    expect(canBreach('barred', 'stack_enter')).toBe(false);
    expect(canBreach('barred', 'ram')).toBe(true);
    expect(canBreach('barred', 'shotgun')).toBe(true);
    expect(canBreach('barred', 'roof_window')).toBe(true);
  });

  it('refuses a method that needs more officers than are present', () => {
    const res = applyEntry(door(), 'stack_enter', 1);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/needs 2/);
  });

  it('a shotgun breach is the costliest thing you can do to a flat', () => {
    const res = applyEntry(door({ state: 'wedged' }), 'shotgun', 1);
    expect(res.ok).toBe(true);
    expect(res.door.state).toBe('breached');
    expect(res.damage).toBe(3);
    expect(res.legitimacy).toBe(4);
  });
});

describe('noise through walls', () => {
  it('a ram is heard from the street; a knock is not', () => {
    const outside = interior.entry_points[0]!;
    const at = { x: outside.x * map.tileSize, y: outside.y * map.tileSize };
    const ram = propagates(map, { source: 'ram', at: { x: 12 * 32, y: 5 * 32 }, radius: 13, walls: 2 }, at);
    const knock = propagates(map, { source: 'shout', at: { x: 9 * 32, y: 5 * 32 }, radius: 2, walls: 0 }, at);
    expect(ram.heard).toBe(true);
    expect(ram.wallsCrossed).toBeGreaterThan(0);
    expect(knock.heard).toBe(false);
  });

  it('a line that happens to run through a doorway crosses no wall', () => {
    // the front-room door and the street door line up, and the log should say so:
    // noise is not "damped by distance", it is damped by what is in the way
    const through = propagates(map, { source: 'ram', at: { x: 7 * 32, y: 9 * 32 }, radius: 13, walls: 2 }, { x: 8 * 32, y: 18 * 32 });
    expect(through.wallsCrossed).toBe(0);
    expect(through.remaining).toBe(13);
  });

  it('walls damp the radius, and the count is stable', () => {
    const inside = { x: 24 * 32, y: 5 * 32 };
    const a = propagates(map, { source: 'ram', at: { x: 7 * 32, y: 9 * 32 }, radius: 9, walls: 2 }, inside);
    const b = propagates(map, { source: 'ram', at: { x: 7 * 32, y: 9 * 32 }, radius: 9, walls: 2 }, inside);
    expect(b).toEqual(a);
    expect(a.remaining).toBeLessThan(8);
  });

  it('counts exactly the listeners who can hear it', () => {
    const listeners = [
      { id: 'inside', at: { x: 9 * 32, y: 5 * 32 } },
      { id: 'street', at: { x: 8 * 32, y: 18 * 32 } },
      { id: 'far', at: { x: 30 * 32, y: 1 * 32 } },
    ];
    const heard = countListeners(map, { source: 'ram', at: { x: 7 * 32, y: 9 * 32 }, radius: 13, walls: 2 }, listeners);
    expect(heard.map((h) => h.id)).toContain('inside');
    expect(heard.map((h) => h.id)).not.toContain('far');
  });
});
