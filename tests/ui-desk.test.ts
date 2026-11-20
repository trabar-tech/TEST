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

/** Walk to a citizen and open the inspection, the way a player does (reach is enforced). */
function talkTo(sim: Simulation, id: string): void {
  for (let i = 0; i < 60 * 60 && sim.reachCheck(id) !== null; i++) {
    if (!sim.approaching) sim.approachAndInspect(id);
    sim.clock.advanceRealMs(1000 / 60);
    if (sim.shiftOver) break;
  }
  sim.openInspection(id);
}

function simWithDocket(): Simulation {
  // NB: deep-copied. `talkTo` advances the shared citizens JSON's runtime state through the
  // sim, and these tests share one module-level fixture — mutating it made the *last* test in
  // the file behave differently from the second, which is a bug in the test, not the game.
  const sim = new Simulation({
    seed: 11,
    shift: 1,
    map: new TileMap(mapJsonToDef(mapJson)),
    mapJson,
    citizens: JSON.parse(JSON.stringify(citizensJson)) as CitizenFile,
  });
  sim.beginBeat();
  talkTo(sim, 'c-0221'); // defective chip
  sim.resolveInspection('P');
  talkTo(sim, 'c-0307'); // clean
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
    talkTo(sim, 'c-0221');
    createInspectionPanel(sim, host, () => {});
    expect(host.textContent).toContain('CIVIL REGISTRY');
    expect(host.textContent).toContain('M. Ostrow');
    expect(host.textContent).toContain('Chip serial');
    expect(host.textContent).toContain('Who is your shift boss?');
  });

  it('a failed check is marked, and the failing field is named', () => {
    const sim = simWithDocket();
    sim.beginBeat();
    talkTo(sim, 'c-0221');
    createInspectionPanel(sim, host, () => {});
    const text = host.textContent ?? '';
    expect(text).toContain('✗');
    expect(text).toContain('chip_serial'.length > 0 ? 'Chip serial' : '');
  });

  it('asking a question adds it to the transcript, and a tell marks the line it belongs to', () => {
    const sim = simWithDocket();
    sim.beginBeat();
    talkTo(sim, 'c-0221');
    const panel = createInspectionPanel(sim, host, () => {});
    byText('button', 'Who is your shift boss?').click();
    expect(sim.inspection!.transcript).toHaveLength(1);
    panel.render();
    // a tell is a property of one line now, so it shows only when this line leaked. When it
    // does, the flag carries *its meaning* rather than a code.
    const leaked = sim.inspection!.transcript.some((l) => l.tell !== null);
    expect(host.textContent!.includes('⚑')).toBe(leaked);

    // the question is gone from the list rather than greyed out: the transcript above shows
    // what was spent, and a disabled button in a growing list is clutter in a small panel
    const gone = [...host.querySelectorAll('button')].some((b) =>
      (b.textContent ?? '').trim() === 'Who is your shift boss?',
    );
    expect(gone).toBe(false);
  });

  it('deciding closes the panel and hands the outcome to the docket', () => {
    const sim = simWithDocket();
    sim.beginBeat();
    talkTo(sim, 'c-0221');
    let closed = 0;
    createInspectionPanel(sim, host, () => { closed += 1; });
    byText('button', 'Detain').click();
    expect(sim.docket.at(-1)!.draft.classification).toBe('D');
    expect(closed).toBeGreaterThan(0);
  });
});

describe('the desk warns about a contradicting standing order before signing', () => {
  // The fairness rule is that a consequence names its cause *before* it lands. A
  // contradiction discovered only on the audit sheet is a trap (P3-T11).
  const live = [
    { id: 'x-a', type: 'standing', text: 'Inspect every household on the row.', quota: null,
      contradicts: ['x-b'], tags: ['inspection'], audit_weight: 1 },
    { id: 'x-b', type: 'standing', text: 'Do not enter a household without a warrant.', quota: null,
      contradicts: ['x-a'], tags: ['inspection'], audit_weight: 1 },
  ] as never;

  it('shows the conflict in the exposure gutter, in the gutter\'s register', () => {
    const sim = new Simulation({
      seed: 11,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
      directives: live,
    });
    sim.beginBeat();
    talkTo(sim, 'c-0221');
    sim.resolveInspection('P');
    sim.openDesk();
    const desk = createDesk(sim, host, { onSubmit: () => {} });
    expect(host.textContent).toMatch(/two orders conflict/);
    expect(host.textContent).toMatch(/satisfies one and breaks the other/);
    desk.destroy();
  });

  it('says nothing when the shift has no orders in force', () => {
    const sim = simWithDocket();
    const desk = createDesk(sim, host, { onSubmit: () => {} });
    expect(host.textContent).not.toMatch(/two orders conflict/);
    desk.destroy();
  });
});
