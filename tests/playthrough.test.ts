// @vitest-environment jsdom
/**
 * A complete playthrough, driven the way the app drives it: the loop in main.ts,
 * but headless and without Pixi.
 *
 * I cannot click the live preview in this sandbox, so this is the substitute:
 * one shift from briefing to debrief to the next briefing, through the real UI
 * components, asserting that a player who never touches a debug API can finish.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { claimOf } from '@core/record';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Simulation, type CitizenFile, type MapJsonSlice } from '@systems/shift';
import { createHud } from '@ui/hud';
import { createInspectionPanel } from '@ui/inspection-panel';
import { createDesk } from '@ui/desk';
import { createDebrief, nextBriefing } from '@ui/debrief';
import { createCaseFile } from '@ui/case-file';
import { Barks, type BarkSet } from '@systems/barks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/kiln_row_slice.json'), 'utf8'),
) as MapJson & MapJsonSlice;
const citizensJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/examples/citizens.slice.json'), 'utf8'),
) as CitizenFile;
const barksJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/examples/barks.json'), 'utf8'),
) as BarkSet;

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
});

function makeSim(): Simulation {
  return new Simulation({
    seed: 2026,
    shift: 1,
    map: new TileMap(mapJsonToDef(mapJson)),
    mapJson,
    citizens: citizensJson,
    quotaInspections: 3,
  });
}

function clickByText(text: string): void {
  const b = [...host.querySelectorAll('button')].find((n) => (n.textContent ?? '').trim() === text);
  if (!b) throw new Error(`no button "${text}" — saw: ${[...host.querySelectorAll('button')].map((n) => n.textContent).join(' | ')}`);
  b.click();
}

describe('a whole shift', () => {
  it('runs briefing → beat → inspection → desk → audit → debrief', () => {
    const sim = makeSim();
    const hud = createHud(sim, host);
    const barks = new Barks(barksJson, 2026, 1);

    hud.radio(barks.radio());
    sim.beginBeat();
    expect(sim.phase).toBe('beat');

    // walk somewhere, so the beat is actually exercised
    expect(sim.moveTo(sim.map.toWorld(20, 14)).ok).toBe(true);
    for (let i = 0; i < 60; i++) sim.clock.advanceRealMs(1000 / 60);

    // inspect three people the way a player would: click, ask, decide
    for (const id of ['c-0221', 'c-0307', 'c-0414']) {
      sim.openInspection(id);
      const panel = createInspectionPanel(sim, host, () => {
        panel.destroy();
      });
      clickByText('Who is your shift boss?');
      clickByText('Show me your hands.');
      clickByText('Pass');
      expect(sim.docket.length).toBeGreaterThan(0);
      void panel;
    }
    expect(sim.docket).toHaveLength(3);

    sim.openDesk();
    const desk = createDesk(sim, host, { onSubmit: () => {} });
    expect(host.textContent).toContain('exposure');

    // file all three honestly
    for (const event of sim.docket) {
      sim.file(event.ref, { claim: claimOf(event.truth), tags: [], free_text: 'Filed from the card.' });
    }
    expect(sim.record.size).toBe(3);
    desk.destroy();

    const result = sim.submit();
    expect(result.review).toBe(false);
    expect(sim.phase).toBe('debrief');

    const debrief = createDebrief(sim, host, { onRestart: () => {} });
    debrief.render(result);
    expect(host.textContent).toContain('Compliance sheet');
    expect(host.textContent).toContain('CLEARED');
    debrief.destroy();

    // and the briefing for tomorrow says something about today
    const belief = sim.belief();
    const next = nextBriefing(result, belief);
    expect(next.text.length).toBeGreaterThan(40);
    expect(next.text).not.toMatch(/evil|hero|tyrant/i);
  });

  it('an honest shift is cleared and an evasive one is not', () => {
    const honest = makeSim();
    honest.beginBeat();
    honest.openInspection('c-0307');
    honest.resolveInspection('P');
    honest.openDesk();
    const e = honest.docket[0]!;
    honest.file(e.ref, { claim: claimOf(e.truth), tags: [], free_text: '' });
    expect(honest.submit().review).toBe(false);

    const evasive = makeSim();
    evasive.beginBeat();
    evasive.openInspection('c-0221');
    evasive.resolveInspection('C');
    evasive.openDesk();
    // file nothing at all
    const r = evasive.submit();
    expect(r.findings.some((f) => f.kind === 'silence')).toBe(true);
  });

  it('the case file renders claims, cracks and never the truth', () => {
    const sim = makeSim();
    sim.beginBeat();
    sim.openInspection('c-0221');
    sim.resolveInspection('P');
    sim.openDesk();
    const e = sim.docket[0]!;
    sim.file(e.ref, { claim: claimOf(e.truth), tags: ['insufficient_papers'], free_text: 'Chip serial did not check.' });
    sim.submit();

    const cf = createCaseFile(sim, host);
    cf.open();
    expect(host.textContent).toContain('the case file');
    expect(host.textContent).toContain('Chip serial did not check.');
    expect(host.textContent).toContain('insufficient_papers');
    // the paper-truth guard, at the level the player sees
    expect(host.textContent).not.toMatch(/third_party_present|illegal_search|bribe_taken/);
    cf.close();
  });
});
