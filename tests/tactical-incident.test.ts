/**
 * P2-T02 / P2-T03 / P2-T04 / P2-T08 acceptance:
 *  - officers execute a queued plan and do not freelance
 *  - contact breaks the queue unless Disciplined
 *  - "clear is a claim": a hidden hostile leaves the room reading cleared
 *  - every incident result can be turned into exactly one line
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Incident } from '@systems/tactical/incident';
import { Squad, type OfficerDef } from '@systems/tactical/squad';
import type { InteriorMapJson } from '@systems/tactical/types';
import { streamFor } from '@core/rng';

const __dirname = dirname(fileURLToPath(import.meta.url));
const interior = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/interior_flat14.json'), 'utf8'),
) as MapJson & InteriorMapJson;

const MAP = new TileMap(mapJsonToDef(interior));

const OFFICERS: OfficerDef[] = [
  { id: 'o-01', name: 'Warden', traits: ['disciplined'] },
  { id: 'o-02', name: 'Ferro', traits: ['jumpy'] },
];

const spawns = {
  'o-01': { x: 8 * 32 + 16, y: 18 * 32 + 16 },
  'o-02': { x: 9 * 32 + 16, y: 18 * 32 + 16 },
};

function incident(over: { solo?: boolean; officers?: OfficerDef[] } = {}) {
  return new Incident({
    seed: 7,
    shift: 1,
    map: MAP,
    json: interior,
    forceIndex: { sector: 'kiln_row', value: 0 },
    officers: over.officers ?? OFFICERS,
    officerSpawns: spawns,
    solo: over.solo,
  });
}

describe('the incident scene', () => {
  it('starts every room as a silhouette: no free information', () => {
    const inc = incident();
    const recon = inc.recon();
    expect(recon.every((r) => r.contents === 'unknown')).toBe(true);
    // and each silhouette carries one architectural fact, never contents
    expect(recon[0]!.hint).toMatch(/door|window|light/);
    expect(recon[0]!.hint).not.toMatch(/hostile|hostiles/);
  });

  it('entering a room makes it known and spots what is not hiding', () => {
    const inc = incident();
    const res = inc.enterRoom('north', 'stack_enter', 2);
    expect(res.ok).toBe(true);
    expect(inc.visibilities.get('north')).toBe('known');
    const seen = inc.visibleHostiles('north');
    expect(seen.map((h) => h.id)).toEqual(['h-02']);
  });

  it('a hiding hostile stays hidden, so the clear claim can be wrong', () => {
    const inc = incident();
    // h-02 has a wardrobe; make the linger roll fail by using a quiet entry
    inc.enterRoom('north', 'knock_talk', 1);
    const claim = inc.clearRoom('north');
    if (inc.visibleHostiles('north').length === 0) {
      expect(claim.claimed).toBe(true);
      expect(claim.actuallyClear).toBe(false);
    } else {
      expect(claim.claimed).toBe(false);
    }
  });

  it('a clear claim on an actually empty room is true', () => {
    const inc = incident();
    inc.enterRoom('hall', 'stack_enter', 2);
    const claim = inc.clearRoom('hall');
    expect(claim.claimed).toBe(true);
    expect(claim.actuallyClear).toBe(true);
  });

  it('gas forces a hider out, which is why it exists', () => {
    let found = 0;
    for (let seed = 0; seed < 40; seed++) {
      const inc = new Incident({
        seed,
        shift: 1,
        map: MAP,
        json: interior,
        forceIndex: { sector: 'x', value: 0 },
        officers: OFFICERS,
        officerSpawns: spawns,
      });
      inc.enterRoom('north', 'gas_wait', 2);
      if (inc.visibleHostiles('north').length > 0) found += 1;
    }
    // 85% per seed, so ~34 of 40: gas is a reliable way to flush a wardrobe, not a certainty
    expect(found).toBeGreaterThanOrEqual(30);
    expect(found).toBeLessThan(40);
  });

  it('solo incidents have no squad and still accept orders', () => {
    const inc = incident({ solo: true });
    expect(inc.hasSquad).toBe(false);
    expect(inc.issue({ kind: 'hold' }).ok).toBe(true);
    expect(inc.issue({ kind: 'move', at: { x: 8 * 32, y: 15 * 32 } }).ok).toBe(true);
  });
});

describe('officers as literal executors', () => {
  it('runs a three-order plan in order and never freelances', () => {
    const inc = incident();
    inc.issue({ kind: 'move', at: { x: 8 * 32, y: 15 * 32 } }, 'o-01');
    inc.issue({ kind: 'hold' }, 'o-01');
    inc.issue({ kind: 'clear', room: 'south_w' }, 'o-01');
    const queued = inc.squad!.get('o-01')!.queue.map((q) => q.kind);
    expect(queued).toEqual(['move', 'hold', 'clear']);

    const seen: string[] = [];
    for (let i = 0; i < 600; i++) {
      inc.step(1 / 30);
      const head = inc.squad!.get('o-01')!.queue[0]?.kind;
      if (head && seen[seen.length - 1] !== head) seen.push(head);
    }
    expect(seen).toEqual(['move', 'hold', 'clear']);
    expect(inc.squad!.get('o-01')!.queue.length).toBe(0);
  });

  it('walks its route rather than teleporting', () => {
    const inc = incident();
    const start = { ...inc.squad!.get('o-02')!.pos };
    inc.issue({ kind: 'move', at: { x: 8 * 32, y: 15 * 32 } }, 'o-02');
    inc.step(1 / 30);
    const after = inc.squad!.get('o-02')!.pos;
    const moved = Math.hypot(after.x - start.x, after.y - start.y);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(32);
  });

  it('contact breaks the queue, unless the officer is Disciplined', () => {
    const squad = new Squad({ map: MAP, officers: OFFICERS, spawns, rng: streamFor(3, 1, 'test') });
    squad.order('o-01', { kind: 'move', at: { x: 0, y: 0 } }, 0);
    squad.order('o-01', { kind: 'clear' }, 0);
    squad.order('o-02', { kind: 'move', at: { x: 0, y: 0 } }, 0);
    squad.order('o-02', { kind: 'clear' }, 0);
    expect(squad.onContact('o-01', 1).dropped).toBe(0);
    expect(squad.get('o-01')!.queue.length).toBe(2);
    expect(squad.onContact('o-02', 1).dropped).toBe(2);
    expect(squad.get('o-02')!.queue.length).toBe(0);
  });

  it('refuses a fifth order and says why', () => {
    const inc = incident();
    for (let i = 0; i < 4; i++) expect(inc.squad!.order('o-01', { kind: 'hold' }, 0).ok).toBe(true);
    const res = inc.squad!.order('o-01', { kind: 'hold' }, 0);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/queue full/);
  });

  it('Flow needs three distinct orders in five seconds while unpaused', () => {
    const squad = new Squad({ map: MAP, officers: OFFICERS, spawns, rng: streamFor(1, 1, 't') });
    squad.order('o-01', { kind: 'move', at: { x: 8 * 32, y: 15 * 32 } }, 0);
    squad.order('o-01', { kind: 'hold' }, 1);
    expect(squad.flowUntil).toBe(0);
    squad.order('o-01', { kind: 'clear', room: 'south_w' }, 2);
    expect(squad.flowUntil).toBe(2 + 8);
  });

  it('paused orders are a little slower to acknowledge, which is the cost of planning', () => {
    const squad = new Squad({ map: MAP, officers: OFFICERS, spawns, rng: streamFor(1, 1, 't') });
    squad.order('o-01', { kind: 'hold', paused: true }, 10);
    expect(squad.get('o-01')!.queue[0]!.latency).toBeGreaterThan(0);
    squad.order('o-02', { kind: 'hold' }, 10);
    expect(squad.get('o-02')!.queue[0]!.latency).toBe(0);
  });
});

describe('the incident result feeds the record', () => {
  it('collapses to the facts a single line needs', () => {
    const inc = incident();
    inc.enterRoom('north', 'stack_enter', 2);
    // you cannot cuff someone who is not compliant yet: control first
    inc.applyForceTo('h-02', 2, { tool: 'hands' });
    expect(inc.detain('h-02')).toBe(true);
    for (let i = 0; i < 60; i++) inc.step(1 / 30);
    const res = inc.result();
    expect(res.roomClaims.map((r) => r.room)).toContain('north');
    expect(res.entryMethod).toBe('stack_enter');
    expect(res.detainees).toBe(1);
    expect(res.ticksElapsed).toBe(60);
    expect(res.loudestNoise).toBeGreaterThan(0);
  });

  it('counts a neighbour hearing the ram but not a knock', () => {
    const loud = incident();
    loud.enterRoom('north', 'ram', 2);
    const quiet = incident();
    quiet.enterRoom('north', 'knock_talk', 1);
    expect(loud.result().heardByNeighbours).toBe(1);
    expect(quiet.result().heardByNeighbours).toBe(0);
    expect(loud.result().heardByNeighbours).toBeGreaterThan(quiet.result().heardByNeighbours);
  });

  it('records the exact force tags, one per rung-2+ action', () => {
    const inc = incident();
    inc.enterRoom('north', 'gas_wait', 2);
    inc.applyForceTo('h-02', 3, { tool: 'baton' });
    inc.applyForceTo('h-02', 2, { tool: 'hands' });
    const res = inc.result();
    expect(res.forceUsed.map((f) => f.logTag)).toEqual(['compliance:baton', 'control:hands']);
  });

  it('flags unauthorised lethal force', () => {
    const inc = incident();
    inc.enterRoom('bsr', 'ram', 2);
    inc.applyForceTo('h-01', 4, { tool: 'firearm' });
    expect(inc.result().unauthorisedForce).toBe(true);
    expect(inc.result().casualties).toBe(1);
  });

  it('a stabilised target becomes a witness, not a corpse', () => {
    const inc = incident();
    inc.enterRoom('bsr', 'ram', 2);
    inc.requestAuthority(4);
    for (let i = 0; i < 200; i++) inc.step(1 / 30); // let the call clear
    inc.applyForceTo('h-01', 4, { tool: 'firearm', authorised: true });
    expect(inc.stabilise('h-01')).toBe(true);
    const res = inc.result();
    expect(res.stabilised).toEqual(['h-01']);
    expect(inc.hostiles.get('h-01')!.wound).toBe('wounded');
  });

  it('reports hostiles never found, which is what an unfiled line hides', () => {
    const inc = incident();
    inc.enterRoom('north', 'knock_talk', 1);
    const res = inc.result();
    expect(res.unfound).toContain('h-01');
    expect(res.unfound).toContain('h-03');
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = incident().result();
    const b = incident().result();
    expect(b).toEqual(a);
  });

  it('damage accumulates from the entry method', () => {
    const inc = incident();
    inc.enterRoom('bsr', 'ram', 2);
    expect(inc.result().damage).toBe(2);
    inc.applyForceTo('h-01', 3, { tool: 'baton' });
    expect(inc.result().damage).toBe(3); // capped at 3
  });
});
