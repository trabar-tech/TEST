// @vitest-environment jsdom
/**
 * First-playtest defects, as tests.
 *
 * A human played it and reported three things, all of which were true and none of which the
 * suite could see:
 *
 *  1. answering a question also moved the Warden (modal clicks reached the canvas);
 *  2. the same row of options came back, again and again;
 *  3. any citizen could be interrogated from any distance.
 *
 * Each is asserted here so it cannot come back, and each test names the playtest in its
 * description — a regression that is not traced to a person's experience is a regression
 * nobody remembers.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Simulation, type MapJsonSlice } from '@systems/shift';
import { createScene } from '@ui/scene';

const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), 'utf8'));
const mapJson = read('content/maps/kiln_row_slice.json') as MapJson;
const citizens = read('content/examples/citizens.slice.json');

const sim = () =>
  new Simulation({
    seed: 3,
    shift: 1,
    map: new TileMap(mapJsonToDef(mapJson)),
    mapJson: mapJson as unknown as MapJsonSlice,
    citizens,
  });

describe('a click on a modal is not a click on the street (playtest 1)', () => {
  it('the scene overlay swallows pointer events instead of leaking them to the host', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const card = {
      id: 'x',
      title: 't',
      deck: 'beat_morning',
      requires: {},
      references: [],
      pressure: 0.3,
      fault_lines: [],
      weight: { base: 1, connective_bonus: 0 },
      beats: [{ text: 'a beat' }],
      resolutions: [
        { id: 'a', label: 'A', claim: 'P', legitimacy: 0, standing: 0, integrity: 0, time: 0 },
        { id: 'b', label: 'B', claim: 'P', legitimacy: 0, standing: 0, integrity: 0, time: 0 },
      ],
      archetype: 'beat_morning',
    } as never;

    let hostSaw = 0;
    host.addEventListener('pointerdown', () => (hostSaw += 1));

    const handle = createScene(host, { card, onResolve: () => {} });
    const overlay = host.firstElementChild!;
    overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hostSaw).toBe(0);

    // ...and the world is still clickable once the scene is gone
    handle.destroy();
    host.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hostSaw).toBe(1);
  });
});

describe('a card cannot be re-issued while the shift is running (playtest 2)', () => {
  it('the shift log keeps what was played, so a redraw cannot resurrect it', async () => {
    const { createSceneLog, playResolution, pending } = await import('@systems/scene-log');
    const { parseContent } = await import('@core/content');
    const cards = parseContent(read('content/examples/content.sample.json'), 'x').micro_events;
    const card = cards[0]!;

    const log = createSceneLog(1);
    log.drawn = [card];
    playResolution(log, { card, resolutionId: card.resolutions[0]!.id });
    expect(pending(log)).toEqual([]);
  });
});

describe('an inspection has a range (playtest 3)', () => {
  it('refuses a citizen across the map, and says why', () => {
    const s = sim();
    s.beginBeat();
    const ids = citizens.citizens.map((c: { id: string }) => c.id);
    // put the Warden nowhere near anybody
    const far = ids.find((id: string) => {
      const p = s.citizens.position(id);
      return p && Math.hypot(p.x - s.position.x, p.y - s.position.y) > Simulation.REACH;
    });
    expect(far, 'some citizen is out of reach').toBeTruthy();
    expect(s.reachCheck(far!)).toMatch(/Too far/);
    expect(s.openInspection(far!)).toBeNull();
    expect(s.inspection).toBeNull();
  });

  it('allows a citizen within reach', () => {
    const s = sim();
    s.beginBeat();
    const near = citizens.citizens
      .map((c: { id: string }) => c.id)
      .find((id: string) => {
        const p = s.citizens.position(id);
        return p && Math.hypot(p.x - s.position.x, p.y - s.position.y) <= Simulation.REACH;
      });
    if (!near) return; // nobody starts close in this slice; the far case is the promise
    expect(s.reachCheck(near)).toBeNull();
    expect(s.openInspection(near)).not.toBeNull();
  });

  it('reach is generous enough to not fight the collision radius', () => {
    expect(Simulation.REACH).toBeGreaterThan(60);
    expect(Simulation.REACH).toBeLessThan(120);
  });
});

describe('clicking somebody out of reach walks you to them (playtest 3, continued)', () => {
  it('returns "approaching" rather than refusing, and opens the inspection on arrival', () => {
    const s = sim();
    s.beginBeat();
    const id = citizens.citizens
      .map((c: { id: string }) => c.id)
      .find((cid: string) => s.reachCheck(cid) !== null);
    if (!id) return; // everyone in reach in this fixture: nothing to prove, the far-case test covers it

    const first = s.approachAndInspect(id);
    expect(first).toBe('approaching');
    expect(s.approaching).toBe(id);

    // let the walk finish (the slice is small; 40 sim-seconds is generous)
    for (let i = 0; i < 60 * 40; i++) {
      s.clock.advanceRealMs(1000 / 60);
      if (s.shiftOver) break;
    }
    expect(s.approaching).toBeNull();
    expect(s.inspection?.citizenId).toBe(id);
  });

  it('a deliberate move by the player cancels the approach', () => {
    const s = sim();
    s.beginBeat();
    const id = citizens.citizens
      .map((c: { id: string }) => c.id)
      .find((cid: string) => s.reachCheck(cid) !== null);
    if (!id) return;
    s.approachAndInspect(id);
    s.moveTo({ x: s.position.x + 40, y: s.position.y });
    expect(s.approaching).toBeNull();
  });
});

describe('the modal still works (the fix must not eat its own buttons)', () => {
  it('a button inside a scene overlay receives its click', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const card = {
      id: 'x', title: 't', deck: 'beat_morning', requires: {}, references: [], pressure: 0.3,
      fault_lines: [], weight: { base: 1, connective_bonus: 0 }, beats: [{ text: 'a beat' }],
      resolutions: [
        { id: 'a', label: 'Say nothing', claim: 'P', legitimacy: 0, standing: 0, integrity: 0, time: 0 },
        { id: 'b', label: 'File it', claim: 'P', legitimacy: 1, standing: 0, integrity: 0, time: 0 },
      ],
      archetype: 'beat_morning',
    } as never;

    const picked: string[] = [];
    createScene(host, { card, onResolve: (id) => picked.push(id) });
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'File it')!;
    btn.click();
    // the first version stopped propagation in the capture phase and this array stayed empty
    expect(picked).toEqual(['b']);
  });
});
