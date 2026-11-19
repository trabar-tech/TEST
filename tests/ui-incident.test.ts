// @vitest-environment jsdom
/**
 * The incident screen, driven the way a player drives it.
 *
 * The claim these tests defend is the phase's thesis: **the form never leaves the
 * screen**. If a tactical action can be taken without the "will be filed" strip
 * changing, then the tactical layer is a game with a form attached, and the phase
 * has failed no matter how good the tactics are.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Incident } from '@systems/tactical/incident';
import { createIncidentView, planSignature } from '@ui/incident-view';
import type { InteriorMapJson } from '@systems/tactical/types';
import type { OfficerDef } from '@systems/tactical/squad';

const __dirname = dirname(fileURLToPath(import.meta.url));
const interior = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/interior_flat14.json'), 'utf8'),
) as MapJson & InteriorMapJson;
const MAP = new TileMap(mapJsonToDef(interior));

const officers: OfficerDef[] = [
  { id: 'o-01', name: 'Renner', traits: ['disciplined'] },
  { id: 'o-02', name: 'Ferro', traits: ['jumpy'] },
];

function mount(over: { solo?: boolean } = {}) {
  const inc = new Incident({
    seed: 5,
    shift: 1,
    map: MAP,
    json: interior,
    forceIndex: { sector: 'kiln_row', value: 0 },
    officers,
    officerSpawns: {
      'o-01': { x: 8 * 32 + 16, y: 18 * 32 + 16 },
      'o-02': { x: 9 * 32 + 16, y: 19 * 32 + 16 },
    },
    solo: over.solo,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const calls: string[] = [];
  const view = createIncidentView(
    inc,
    host,
    {
      onEnter: (room, method) => {
        calls.push(`enter:${room}:${method}`);
        inc.enterRoom(room, method, inc.squad?.size ?? 1);
        view.render();
      },
      onClear: (room) => {
        calls.push(`clear:${room}`);
        inc.clearRoom(room);
        view.render();
      },
      onOrder: (kind) => {
        calls.push(`order:${kind}`);
        inc.issue({ kind });
        view.render();
      },
      onForce: (target, rung) => {
        calls.push(`force:${target}:${rung}`);
        inc.applyForceTo(target, rung);
        view.render();
      },
      onDetain: (target) => {
        calls.push(`detain:${target}`);
        inc.detain(target);
        view.render();
      },
      onAuthorise: (rung) => calls.push(`authorise:${rung}`),
      onStabilise: (target) => calls.push(`stabilise:${target}`),
      onEnd: () => calls.push('end'),
    },
    { address: 'Block C, flat fourteen' },
  );
  return { inc, host, view, calls };
}

afterEach(() => {
  document.body.innerHTML = '';
});

function click(root: HTMLElement, text: string, nth = 0): void {
  const all = [...root.querySelectorAll('button')].filter((x) => (x.textContent ?? '').trim() === text);
  const b = all[nth];
  if (!b) throw new Error(`no button "${text}"#${nth} — have: ${[...root.querySelectorAll('button')].map((x) => x.textContent).join(' | ')}`);
  (b as HTMLButtonElement).click();
}

/**
 * Room order in the left column follows the map: north, bsr, hall, south_w,
 * south_e. The bed-sitting room is index 1, and its door is **locked**, so the
 * only candidate that gets in is the ram — which is exactly the design: the room
 * tells you what it will cost before you knock.
 */
const BSR = 1;

describe('the incident screen', () => {
  it('shows a silhouette for every room before you go in, and no contents', () => {
    const { view } = mount();
    const text = view.root.textContent ?? '';
    expect(text).toContain('· · ·');
    expect(text).not.toContain('subject(s) visible');
    // the architectural read is present: that is the information gating
    expect(text).toMatch(/barred|door closed|reinforced|ajar/);
  });

  it('the "will be filed" strip is on screen while you plan', () => {
    const { view } = mount();
    expect(view.root.textContent).toContain('WILL BE FILED');
    expect(view.root.textContent).toContain('rooms entered');
  });

  it('entering a room changes the form strip: the flat stops being a silhouette', () => {
    const { view, host, inc } = mount();
    click(host, 'Knock & talk');
    expect(inc.visibilities.get('north')).toBe('known');
    const text = view.root.textContent ?? '';
    expect(text).toContain('FRONT ROOM');
    expect(text).toContain('ENTRY');
    expect(text).toContain('knock_talk');
  });

  it('a loud entry is readable in the strip before the player commits to filing', () => {
    const { view, host } = mount();
    click(host, 'Ram');
    const text = view.root.textContent ?? '';
    // noise is a tile count the player can compare against the room they are in
    expect(text).toContain('9 tiles');
  });

  it('offers the force rungs only once a subject is visible', () => {
    const { view, host } = mount();
    const before = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(before).not.toContain('4');
    click(host, 'Ram', BSR);
    const after = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(after).toContain('4');
    expect(view.root.textContent).toContain('subject(s) visible');
  });

  it('rung 2 then rung 3 both stay on the strip as one line, highest rung wins', () => {
    const { view, host } = mount();
    click(host, 'Ram', BSR);
    click(host, '2');
    expect(view.root.textContent).toMatch(/force\s*2/);
    click(host, '3');
    expect(view.root.textContent).toMatch(/force\s*3/);
    expect(view.root.textContent).toMatch(/3 · Compliance/);
  });

  it('detain is offered only when compliance allows it', () => {
    const { host } = mount();
    click(host, 'Ram', BSR);
    // 55 compliance at scene start: not yet cuffed-able
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Detain');
    click(host, '2');
    // +25 from control: now the cuff is legal and the strip says so
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toContain('Detain');
    click(host, 'Detain');
    expect(host.textContent).toContain('DETAINED');
  });

  it('the order buttons exist for a squad, and are the solo five without one', () => {
    const squad = mount();
    const squadLabels = [...squad.host.querySelectorAll('button')].map((b) => b.textContent);
    expect(squadLabels).toEqual(expect.arrayContaining(['STACK', 'BREACH', 'CLEAR', 'DETAIN', 'REGROUP']));

    const solo = mount({ solo: true });
    const soloLabels = [...solo.host.querySelectorAll('button')].map((b) => b.textContent);
    expect(soloLabels).toContain('HOLD');
    expect(soloLabels).not.toContain('STACK');
    expect(solo.view.root.textContent).toContain('NO SQUAD');
  });

  it('ending the incident is one button and it calls back exactly once', () => {
    const { host, calls } = mount();
    click(host, 'END THE INCIDENT');
    expect(calls).toEqual(['end']);
  });

  it('a cleared room says so, and clearing twice is not free of doubt', () => {
    const { host, inc } = mount();
    click(host, 'Knock & talk');
    click(host, 'Clear the room');
    // north holds a man in a wardrobe where a wardrobe is what the room has: if he
    // stayed in it, the room reads cleared and is not. Either way, the *claim* is
    // always allowed — that is the trap.
    const claim = inc.clearRoom('north');
    expect(claim.claimed).toBe(true);
    expect(claim.actuallyClear).toBe(inc.hostiles.get('h-02')!.wound === 'dead');
  });

  it('the plan signature is stable for the same state and changes when it does', () => {
    const { inc, host } = mount();
    const a = planSignature(inc);
    click(host, 'Knock & talk');
    expect(planSignature(inc)).not.toBe(a);
    expect(planSignature(inc)).toBe(planSignature(inc));
  });
});
