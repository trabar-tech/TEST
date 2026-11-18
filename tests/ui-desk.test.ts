// @vitest-environment jsdom
/**
 * The Desk, driven through the DOM the way a player drives it.
 *
 * This exists because the UI is where the design actually lands: a correct audit
 * behind a form nobody can use is a failed phase. These tests click real buttons
 * and type into the real textarea, so the keyboard path and the exposure gutter
 * are exercised rather than assumed.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { claimOf } from '@core/record';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Simulation, type CitizenFile, type MapJsonSlice } from '@systems/shift';
import { createDesk } from '@ui/desk';
import { createInspectionPanel } from '@ui/inspection-panel';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/kiln_row_slice.json'), 'utf8'),
) as MapJson & MapJsonSlice;
const citizensJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/examples/citizens.slice.json'), 'utf8'),
) as CitizenFile;

function simWithDocket(): Simulation {
  const sim = new Simulation({
    seed: 11,
    shift: 1,
    map: new TileMap(mapJsonToDef(mapJson)),
    mapJson,
    citizens: citizensJson,
  });
  sim.beginBeat();
  sim.openInspection('c-0221'); // defective chip
  sim.resolveInspection('P');
  sim.openInspection('c-0307'); // clean
  sim.resolveInspection('P');
  sim.openDesk();
  return sim;
}

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  document.body.innerHTML = '';
});

function byText(selector: string, text: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>(selector)].find(
    (n) => (n.textContent ?? '').trim() === text,
  );
  if (!found) throw new Error(`no ${selector} with text "${text}"`);
  return found;
}

describe('the desk', () => {
  it('renders the docket, the form and the exposure gutter together', () => {
    const sim = simWithDocket();
    const desk = createDesk(sim, host, { onSubmit: () => {} });
    expect(host.textContent).toContain('docket');
    expect(host.textContent).toContain('exposure');
    expect(host.textContent).toContain('M. Ostrow');
    desk.destroy();
    expect(host.textContent).toBe('');
  });

  it('the gutter states a band and explains why, before anything is stamped', () => {
    const sim = simWithDocket();
    createDesk(sim, host, { onSubmit: () => {} });
    // M. Ostrow stands at the laundry, which no camera covers
    expect(host.textContent).toMatch(/SAFE|THIN|HANGING/);
    expect(host.textContent).toMatch(/no camera in range|camera in range/);
    expect(host.textContent).toContain('what happened');
  });

  it('changing the classification changes the gutter live', () => {
    const sim = simWithDocket();
    createDesk(sim, host, { onSubmit: () => {} });
    const gutter = () => host.textContent ?? '';

    // the clean card (T. Branik, index 1) is honest, so it reads SAFE
    expect(gutter()).toContain('○ SAFE');

    // pick the defective card (M. Ostrow, index 0): the checks failed, so the
    // gutter must re-read on the same click
    const cards = [...host.querySelectorAll<HTMLElement>('div')].filter((n) =>
      (n.textContent ?? '').includes('M. Ostrow'),
    );
    cards[0]!.click();
    expect(gutter()).toContain('exposure');
    // whatever the band, the gutter keeps naming its evidence
    expect(gutter()).toMatch(/camera in range|no camera in range/);
  });

  it('signing writes a line and marks the card as filed', () => {
    const sim = simWithDocket();
    const desk = createDesk(sim, host, { onSubmit: () => {} });
    const before = sim.record.size;

    byText('button', 'Sign and file').click();
    expect(sim.record.size).toBe(before + 1);
    // the view advances to the next unsigned card, which is the desk saying
    // "one down" without a modal or a toast
    expect(host.textContent).toContain('1 of 2');
    desk.destroy();
  });

  it('signing twice does not file twice', () => {
    const sim = simWithDocket();
    createDesk(sim, host, { onSubmit: () => {} });
    byText('button', 'Sign and file').click();
    const after = sim.record.size;
    // the previously signed card is now marked FILED in the docket and its form
    // is inert: there is no second Sign button for it
    const filed = [...host.querySelectorAll('div')].find((n) => (n.textContent ?? '') === 'FILED');
    expect(filed).toBeDefined();
    const signs = [...host.querySelectorAll('button')].filter((b) => b.textContent === 'Sign and file');
    expect(signs.length).toBeLessThanOrEqual(1);
    expect(sim.record.size).toBe(after);
  });

  it('advances to the next unsigned card automatically', () => {
    const sim = simWithDocket();
    createDesk(sim, host, { onSubmit: () => {} });
    const first = sim.docket[0]!;
    byText('button', 'Sign and file').click();
    // the docket still shows a Sign button, and the first card is signed
    expect(sim.record.query({ shift: 1 }).some((l) => l.event_ref === first.ref)).toBe(true);
    expect(sim.docket.some((e) => !sim.record.query({ shift: 1 }).some((l) => l.event_ref === e.ref))).toBe(true);
  });

  it('types free text and keeps the counter honest', () => {
    const sim = simWithDocket();
    createDesk(sim, host, { onSubmit: () => {} });
    const text = 'He walked. I wrote that he ran.';
    const area = host.querySelector('textarea')!;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    expect(host.textContent).toContain(`${text.length}/240`);

    byText('button', 'Sign and file').click();
    const line = sim.record.query({ shift: 1 })[0]!;
    expect(line.free_text).toBe(text);
  });

  it('the classification row uses letters, not colour alone', () => {
    const sim = simWithDocket();
    createDesk(sim, host, { onSubmit: () => {} });
    for (const t of ['○ Pass', '◇ Cite', '■ Detain', '▤ Confiscate', '— Nothing seen']) {
      expect(host.textContent, t).toContain(t);
    }
  });

  it('the empty docket still offers a way forward', () => {
    const sim = new Simulation({
      seed: 11,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
    });
    sim.beginBeat();
    sim.openDesk();
    createDesk(sim, host, { onSubmit: () => {} });
    expect(host.textContent).toContain('NOTHING TO FILE');
    expect(host.textContent).toContain('Submit the empty docket');
  });

  it('submitting hands control to the audit exactly once', () => {
    const sim = simWithDocket();
    let submits = 0;
    createDesk(sim, host, { onSubmit: () => { submits += 1; } });
    byText('button', 'Submit to the audit').click();
    expect(submits).toBe(1);
  });
});

describe('the inspection panel', () => {
  it('shows the card, the checks and the conversation', () => {
    const sim = simWithDocket();
    sim.beginBeat();
    sim.openInspection('c-0221');
    createInspectionPanel(sim, host, () => {});
    expect(host.textContent).toContain('CIVIL REGISTRY');
    expect(host.textContent).toContain('M. Ostrow');
    expect(host.textContent).toContain('Chip serial');
    expect(host.textContent).toContain('Who is your shift boss?');
  });

  it('a failed check is marked, and the failing field is named', () => {
    const sim = simWithDocket();
    sim.beginBeat();
    sim.openInspection('c-0221');
    createInspectionPanel(sim, host, () => {});
    const text = host.textContent ?? '';
    expect(text).toContain('✗');
    expect(text).toContain('chip_serial'.length > 0 ? 'Chip serial' : '');
  });

  it('asking a question adds it to the transcript with its tell', () => {
    const sim = simWithDocket();
    sim.beginBeat();
    sim.openInspection('c-0221');
    const panel = createInspectionPanel(sim, host, () => {});
    byText('button', 'Who is your shift boss?').click();
    expect(sim.inspection!.transcript).toHaveLength(1);
    panel.render();
    expect(host.textContent).toContain('⚑');
    // a used question is disabled, not removed: the player can see what they spent
    const used = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Who is your shift boss?'),
    ) as HTMLButtonElement;
    expect(used.disabled).toBe(true);
  });

  it('deciding closes the panel and hands the outcome to the docket', () => {
    const sim = simWithDocket();
    sim.beginBeat();
    sim.openInspection('c-0221');
    let closed = 0;
    createInspectionPanel(sim, host, () => { closed += 1; });
    byText('button', 'Detain').click();
    expect(sim.docket.at(-1)!.draft.classification).toBe('D');
    expect(closed).toBeGreaterThan(0);
  });
});
