// @vitest-environment jsdom
/**
 * The phase's real acceptance test (P2-T08, exit criterion 4).
 *
 * A tactical incident goes through the desk, into the Record, and the audit
 * either accepts it or exposes it. Nothing here is mocked: it is the same
 * `Simulation`, the same `Incident`, the same `createDesk`, and the same audit.
 *
 * Two paths matter:
 *   - the honest file, which survives because it matches the scene;
 *   - the lie about a cleared room, which the audit can catch because the noise
 *     and the damage stayed in the log even when the player edited the claim.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { slack } from '@core/record';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Simulation, type CitizenFile, type MapJsonSlice } from '@systems/shift';
import { Incident } from '@systems/tactical/incident';
import { createDesk } from '@ui/desk';
import type { InteriorMapJson } from '@systems/tactical/types';
import type { OfficerDef } from '@systems/tactical/squad';

const __dirname = dirname(fileURLToPath(import.meta.url));
const street = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/kiln_row_slice.json'), 'utf8'),
) as MapJson & MapJsonSlice;
const interior = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/interior_flat14.json'), 'utf8'),
) as MapJson & InteriorMapJson;
const citizensJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/examples/citizens.slice.json'), 'utf8'),
) as CitizenFile;

const SHIFT_MAP = new TileMap(mapJsonToDef(street));
const FLAT_MAP = new TileMap(mapJsonToDef(interior));

const officers: OfficerDef[] = [
  { id: 'o-01', name: 'Renner', traits: ['disciplined'] },
  { id: 'o-02', name: 'Ferro', traits: ['jumpy'] },
];

function boot() {
  const sim = new Simulation({
    seed: 4242,
    shift: 1,
    map: SHIFT_MAP,
    mapJson: street,
    citizens: citizensJson,
    quotaInspections: 1,
  });
  sim.beginBeat();
  return sim;
}

function raid(via: 'quiet' | 'loud'): Incident {
  const inc = new Incident({
    seed: 4242,
    shift: 1,
    map: FLAT_MAP,
    json: interior,
    forceIndex: { sector: 'kiln_row', value: 0 },
    officers,
    officerSpawns: {
      'o-01': { x: 8 * 32 + 16, y: 18 * 32 + 16 },
      'o-02': { x: 9 * 32 + 16, y: 19 * 32 + 16 },
    },
  });
  if (via === 'quiet') {
    inc.enterRoom('north', 'knock_talk', 1);
    inc.applyForceTo('h-02', 2, { tool: 'hands' });
    inc.detain('h-02');
  } else {
    inc.enterRoom('bsr', 'shotgun', 2);
    inc.applyForceTo('h-01', 4, { tool: 'firearm' });
  }
  return inc;
}

function openDeskFor(sim: Simulation) {
  const host = document.createElement('div');
  document.body.append(host);
  sim.openDesk();
  const desk = createDesk(sim, host, { onSubmit: () => sim.submit() });
  return { host, desk };
}

function click(root: HTMLElement, text: string): void {
  const b = [...root.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === text);
  if (!b) throw new Error(`no button "${text}" — have ${[...root.querySelectorAll('button')].map((x) => x.textContent).join(' | ')}`);
  (b as HTMLButtonElement).click();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an incident on the same docket as an inspection', () => {
  it('lands as one card, next to the inspection cards, not in a separate screen', () => {
    const sim = boot();
    const inc = raid('quiet');
    const result = inc.result();
    const event = sim.addIncident(result, {
      ref: 'int-1-1',
      address: 'Block C, flat fourteen',
      cameras: ['cam:stairwell'],
    });
    expect(event.kind).toBe('incident');
    expect(sim.docket).toHaveLength(1);
    expect(event.scene?.roomsCleared).toBe(1);
    expect(event.scene?.entry).toBe('knock_talk');
    // the draft is honest: the player has to *edit* to lie
    expect(slack(event.draft, event.truth)).toBe(0);
  });

  it('the desk shows the scene facts and refuses to let the player edit them', () => {
    const sim = boot();
    sim.addIncident(raid('loud').result(), { ref: 'int-1-1', address: 'Block C, flat fourteen' });
    const { host } = openDeskFor(sim);
    // the gutter is uppercase-styled in the DOM but the text is the contract
    expect(host.textContent?.toLowerCase()).toContain('the scene');
    expect(host.textContent?.toLowerCase()).toContain('heard from the street');
    expect(host.textContent).toContain('You can only leave it out.');
    // and the tag vocabulary gained the tactical words
    expect(host.textContent).toContain('forced_entry');
  });

  it('filing the honest line leaves the record intact and the audit calm', () => {
    const sim = boot();
    const result = raid('quiet').result();
    const event = sim.addIncident(result, { ref: 'int-1-1', address: 'Block C, flat fourteen' });
    const { host } = openDeskFor(sim);

    click(host, 'Sign and file');
    const lines = sim.record.query({});
    expect(lines).toHaveLength(1);
    expect(lines[0]!.category).toBe('incident');
    expect(lines[0]!.derived.slack).toBe(0);
    expect(lines[0]!.claim.force_rung).toBe(event.truth.force_rung);

    const audit = sim.submit();
    expect(audit.review).toBe(false);
  });

  it('a lie about a loud raid is caught, because the log kept the noise', () => {
    const sim = boot();
    const result = raid('loud').result();
    const event = sim.addIncident(result, { ref: 'int-1-1', address: 'Block C, flat fourteen' });
    const { host } = openDeskFor(sim);

    // lie the way a player actually lies: class it as a pass, then strike the
    // facts the scene recorded off the line
    click(host, '○ Pass');
    click(host, '◉ third party');
    click(host, '◉ audible from street');
    click(host, '◉ premises not fully searched');
    // and bring the damage figure down to match the story
    for (let i = 0; i < 2; i++) {
      const minus = [...host.querySelectorAll('button')]
        .filter((b) => b.textContent === '−' && !(b as HTMLButtonElement).disabled)
        .at(-1);
      (minus as HTMLButtonElement)?.click();
    }
    click(host, 'Sign and file');

    const line = sim.record.query({})[0]!;
    expect(line.claim.classification).toBe('P');
    expect(line.claim.property).not.toContain('third_party');
    expect(line.derived.slack).toBeGreaterThanOrEqual(0.2);
    // the scene facts are still in the filed line the audit reads
    expect(event.scene?.heardByNeighbours).toBeGreaterThan(0);
    expect(event.scene?.damage).toBe(3);
    // shotgun at the door *and* a shot fired: two things a neighbour can attest
    expect(line.scene?.heardByNeighbours).toBeGreaterThanOrEqual(1);

    const audit = sim.submit();
    expect(audit.review).toBe(true);
  });

  it('an unfiled incident is auto-filed against the player, and it says so', () => {
    const sim = boot();
    sim.addIncident(raid('loud').result(), { ref: 'int-1-1', address: 'Block C, flat fourteen' });
    const audit = sim.submit();
    const auto = sim.record.query({}).filter((l) => l.authority === 'ai_auto');
    expect(auto).toHaveLength(1);
    expect(auto[0]!.event_ref).toBe('int-1-1');
    // the auto line is the *truth*, so the scene test has nothing to catch; what
    // the player is punished for is the silence itself, on the audit sheet
    const silence = audit.findings.filter((f) => f.kind === 'silence');
    expect(silence).toHaveLength(1);
    expect(audit.sheet.join(' ')).toMatch(/SILENCE/);
    expect(auto[0]!.scene).toBeDefined();
  });

  it('two incidents in one shift produce a docket the player has to work through', () => {
    const sim = boot();
    sim.addIncident(raid('quiet').result(), { ref: 'int-1-1', address: 'Block C, flat fourteen' });
    sim.addIncident(raid('loud').result(), { ref: 'int-1-2', address: 'Canal market' });
    const { host } = openDeskFor(sim);
    expect(sim.docket).toHaveLength(2);
    expect(host.textContent).toContain('2 events');
    click(host, 'Sign and file');
    click(host, 'Sign and file');
    expect(sim.record.query({})).toHaveLength(2);
    expect(sim.record.query({}).every((l) => l.derived.slack === 0)).toBe(true);
  });

  it('the force ratchet carries the raid into next shift\'s temperature', () => {
    const sim = boot();
    const result = raid('loud').result();
    // mirror what main.ts does on close
    const weight = result.forceUsed.reduce(
      (a, f) => a + (f.rung === 5 ? 9 : f.rung === 4 ? 6 : f.rung === 3 ? 2.5 : 1),
      0,
    );
    expect(weight).toBeGreaterThanOrEqual(6);
    const next = new Incident({
      seed: 4242,
      shift: 2,
      map: FLAT_MAP,
      json: interior,
      forceIndex: { sector: 'kiln_row', value: weight * 3 },
      officers,
      officerSpawns: { 'o-01': { x: 8 * 32, y: 18 * 32 }, 'o-02': { x: 9 * 32, y: 18 * 32 } },
    });
    // three loud shifts in a row and the room starts angrier than it did tonight
    expect(next.hostiles.get('h-01')!.aggression).toBeGreaterThan(
      new Incident({
        seed: 4242,
        shift: 2,
        map: FLAT_MAP,
        json: interior,
        forceIndex: { sector: 'kiln_row', value: 0 },
        officers,
        officerSpawns: { 'o-01': { x: 8 * 32, y: 18 * 32 }, 'o-02': { x: 9 * 32, y: 18 * 32 } },
      }).hostiles.get('h-01')!.aggression,
    );
    expect(sim.record.query({})).toHaveLength(0);
  });
});
