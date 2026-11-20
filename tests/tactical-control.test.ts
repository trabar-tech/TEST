/**
 * Direct control of the Warden (playtest 2).
 *
 * The tester said the game should be "a tactical shooter with bureaucracy sim". The
 * bureaucracy half was real; the tactical half was a plan board that *ordered a body around*.
 * These tests cover the body: it moves under input, it aims, it fires — and every shot becomes
 * a fact the paperwork can catch you on, which is the only reason the genre mix works.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Incident, type IncidentResult } from '@systems/tactical/incident';
import type { InteriorMapJson } from '@systems/tactical/types';

const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), 'utf8'));
const json = read('content/maps/interior_flat14.json') as InteriorMapJson & MapJson;

const solo = () =>
  new Incident({
    seed: 5,
    shift: 1,
    map: new TileMap(mapJsonToDef(json)),
    json,
    forceIndex: { sector: 0.4, value: 6 } as never,
    solo: true,
  });

describe('the body moves under the player’s hands', () => {
  it('a held direction moves the Warden, and releasing it stops them', () => {
    const inc = solo();
    const start = { ...inc.warden };
    inc.setMoveIntent({ x: 1, y: 0 });
    for (let i = 0; i < 20; i++) inc.step(1 / 60);
    expect(inc.warden.x).toBeGreaterThan(start.x);
    const moving = { ...inc.warden };
    inc.setMoveIntent(null);
    for (let i = 0; i < 20; i++) inc.step(1 / 60);
    expect(inc.warden).toEqual(moving);
  });

  it('a diagonal is normalised, so W+D is not 41% faster than D', () => {
    const a = solo();
    const b = solo();
    a.setMoveIntent({ x: 1, y: 0 });
    b.setMoveIntent({ x: 1, y: 1 });
    for (let i = 0; i < 20; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    const da = Math.hypot(a.warden.x - 0, a.warden.y - 0);
    void da;
    // both should have travelled the same distance from their shared start
    const startA = Math.hypot(a.warden.x - a.warden.x, 0);
    void startA;
    const travelledA = Math.hypot(a.warden.x - solo().warden.x, a.warden.y - solo().warden.y);
    const travelledB = Math.hypot(b.warden.x - solo().warden.x, b.warden.y - solo().warden.y);
    expect(Math.abs(travelledA - travelledB)).toBeLessThan(1);
  });

  it('walls stop the body rather than being walked through', () => {
    const inc = solo();
    // walk hard into whatever is up-left of the entry point for a while
    inc.setMoveIntent({ x: -1, y: -1 });
    for (let i = 0; i < 300; i++) inc.step(1 / 60);
    const tile = inc.map.toTile(inc.warden);
    expect(inc.map.isWalkable(tile.tx, tile.ty)).toBe(true);
  });

  it('direct control cancels an order route instead of fighting it', () => {
    const inc = solo();
    inc.issue({ kind: 'move', at: { x: inc.warden.x + 200, y: inc.warden.y } });
    inc.setMoveIntent({ x: 0, y: 1 });
    const before = { ...inc.warden };
    for (let i = 0; i < 10; i++) inc.step(1 / 60);
    // the held direction wins: the Warden moved down-ish, not along the queued route
    expect(inc.warden.y).toBeGreaterThan(before.y);
  });
});

describe('a shot is a fact, not a reflex check', () => {
  it('firing records force used at the top rung, and is loud', () => {
    const inc = solo();
    const before = inc.forceUsed.length;
    const shot = inc.fire();
    expect(shot.fired).toBe(true);
    expect(inc.forceUsed.length).toBe(before + 1);
    expect(inc.forceUsed.at(-1)!.rung).toBe(5);
    // the loudest thing in the building: a noise with a radius, which the desk will see
    expect(inc.noises.some((n) => n.source === 'shot')).toBe(true);
  });

  it('a shot without authorisation is exactly the finding the audit looks for', () => {
    const inc = solo();
    inc.fire();
    expect(inc.unauthorisedForce).toBe(true);
  });

  it('the weapon has a cadence, so clicking faster does not shoot faster', () => {
    const inc = solo();
    expect(inc.fire().fired).toBe(true);
    const second = inc.fire();
    expect(second.fired).toBe(false);
    expect(second.reason).toMatch(/empty/);
    // and it comes back after the cooldown
    for (let i = 0; i < 60; i++) inc.step(1 / 60);
    expect(inc.fire().fired).toBe(true);
  });

  it('a subject in the lane is hit; one behind you is not', () => {
    const inc = solo();
    const target = [...inc.hostiles.values()][0]!;
    // stand next to them and aim at them
    inc.warden = { x: target.pos.x - 30, y: target.pos.y };
    inc.setAim(0);
    target.spotted = true;
    const shot = inc.fire();
    expect(shot.fired).toBe(true);
    expect(shot.hit).toBe(target.id);

    const inc2 = solo();
    const t2 = [...inc2.hostiles.values()][0]!;
    inc2.warden = { x: t2.pos.x - 30, y: t2.pos.y };
    inc2.setAim(Math.PI); // facing away
    t2.spotted = true;
    expect(inc2.fire().hit).toBeNull();
  });

  it('a fatal shot is counted as a casualty, because the record counts casualties', () => {
    const inc = solo();
    const t = [...inc.hostiles.values()][0]!;
    inc.warden = { x: t.pos.x - 30, y: t.pos.y };
    inc.setAim(0);
    t.spotted = true;
    inc.fire();
    expect(t.wound).toBe('wounded');
    for (let i = 0; i < 60; i++) inc.step(1 / 60);
    inc.fire();
    expect(t.wound).toBe('dead');
    expect(inc.casualties).toBe(1);
  });

  it('the aim line knows when a wall is in the way, so the player can see it', () => {
    const inc = solo();
    // every direction into a wall must be reported somewhere in a full turn
    let blocked = 0;
    for (let i = 0; i < 16; i++) {
      inc.setAim((i / 16) * Math.PI * 2);
      if (inc.aimLineBlocked) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(16); // and not every direction is a wall
  });

  it('after the incident ends, the trigger is dead', () => {
    const inc = solo();
    const r = inc.result() as IncidentResult;
    void r;
    inc['ended'] = true;
    expect(inc.fire().fired).toBe(false);
  });
});

/**
 * Being shot at (playtest 2, step 2).
 *
 * Playtest 1 asked for a shooter and got one, but the body in it could not be hurt: `soloHits`
 * was counted and then ignored, so nothing in the tactical layer could go wrong. Injury is now
 * the failure state, on purpose — the punishment for a bad scene is the *paperwork* it
 * generates, not a game-over screen.
 */
describe('the Warden can be hurt, and being hurt costs something', () => {
  it('starts at full, and three hits put them down', () => {
    const inc = solo();
    expect(inc.wardenHealth).toBe(3);
    expect(inc.wardenDown).toBe(false);
    expect(inc.takeHit()).toBe(false);
    expect(inc.takeHit()).toBe(false);
    expect(inc.takeHit()).toBe(true);
    expect(inc.wardenDown).toBe(true);
    expect(inc.wardenHealth).toBe(0);
  });

  it('a hit is loud: whoever is in the building hears the Warden shout', () => {
    const inc = solo();
    const before = inc.noises.length;
    inc.takeHit();
    expect(inc.noises.length).toBe(before + 1);
    expect(inc.noises.at(-1)?.source).toBe('shout');
  });

  it('wounds slow the body — an injured Warden is not a reskin of a healthy one', () => {
    const walk = (inc: Incident): number => {
      const start = inc.warden.x;
      inc.setMoveIntent({ x: 1, y: 0 });
      for (let i = 0; i < 20; i++) inc.step(1 / 60);
      return Math.abs(inc.warden.x - start);
    };
    const healthy = walk(solo());
    const hurt = solo();
    hurt.takeHit();
    hurt.takeHit();
    expect(walk(hurt)).toBeLessThan(healthy);
  });

  it('a downed Warden cannot fire, and cannot be hurt further', () => {
    const inc = solo();
    for (let i = 0; i < 3; i++) inc.takeHit();
    expect(inc.fire()).toMatchObject({ fired: false, reason: 'you are down' });
    expect(inc.takeHit()).toBe(false);
    expect(inc.soloHits).toBe(3);
  });

  it('being down is carried into the result, because the record is the consequence', () => {
    const inc = solo();
    for (let i = 0; i < 3; i++) inc.takeHit();
    const result = inc.result();
    expect(result.wardenDown).toBe(true);
    expect(result.soloHits).toBe(3);
  });

  it('the wound readout is 0 at full health and approaches 1 as hits land', () => {
    const inc = solo();
    expect(inc.wardenWound).toBe(0);
    inc.takeHit();
    expect(inc.wardenWound).toBeGreaterThan(0);
    expect(inc.wardenWound).toBeLessThan(1);
  });
});

describe('a downed Warden ends the scene', () => {
  it('the incident stops stepping once the Warden is down', () => {
    const inc = solo();
    for (let i = 0; i < 3; i++) inc.takeHit();
    const t = inc.tick;
    inc.step(1 / 60);
    inc.step(1 / 60);
    expect(inc.tick).toBe(t);
    expect(inc['ended']).toBe(true);
  });
});
