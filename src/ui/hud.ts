/**
 * The Beat's HUD: shift clock, quota, docket count, and a citizen nameplate on
 * hover. Small on purpose — the street should be the thing you look at.
 */

import type { Simulation } from '@systems/shift';
import type { CitizenDef } from '@systems/citizens';
import { bandChip, clear, el, label, note, panel } from './dom';

export interface HudHandle {
  tick(): void;
  setHover(citizen: CitizenDef | null): void;
  setPrompt(text: string | null): void;
  /** flashing banner, used for the briefing and the gate clock */
  announce(text: string, ms?: number): void;
  /** the Overwatch voice, or a loudspeaker: top-left, quiet, persistent */
  radio(text: string, kind?: 'radio' | 'speaker'): void;
  /** a stage direction: bottom-right, dimmer, transient */
  ambient(text: string): void;
  destroy(): void;
}

export function createHud(sim: Simulation, host: HTMLElement): HudHandle {
  const root = el('div', 'position:absolute;inset:0;pointer-events:none');

  const bar = panel('top:10px;left:50%;transform:translateX(-50%);min-width:340px;text-align:center');
  const clockLine = el('div', 'font-size:18px;letter-spacing:.18em;color:#e6eef6');
  const subLine = el('div', 'font-size:10px;letter-spacing:.12em;color:#6f7d8b;margin-top:2px');
  bar.append(clockLine, subLine);

  const quota = panel('top:10px;right:10px;min-width:150px');
  const quotaTitle = label('quota');
  const quotaBody = el('div', 'margin-top:4px');
  quota.append(quotaTitle, quotaBody);

  const plate = panel('pointer-events:none;opacity:0;transition:opacity .12s ease;max-width:300px');
  plate.style.bottom = '150px';
  plate.style.left = '10px';

  const prompt = el(
    'div',
    'position:absolute;left:50%;bottom:26px;transform:translateX(-50%);font:11px ui-monospace,monospace;color:#93a1af;letter-spacing:.08em;opacity:0;transition:opacity .15s ease',
  );

  const banner = el(
    'div',
    'position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);max-width:min(560px,86vw);padding:14px 18px;background:rgba(9,12,15,.94);border:1px solid rgba(120,140,160,.3);border-radius:3px;font:13px/1.65 ui-monospace,monospace;color:#c9d3dd;opacity:0;transition:opacity .25s ease;white-space:pre-wrap',
  );

  const radioBox = panel('pointer-events:none;top:10px;left:10px;max-width:250px;opacity:0;transition:opacity .3s ease;border-color:rgba(216,176,106,.35)');
  const radioLabel = label('sector control');
  const radioText = el('div', 'margin-top:4px;color:#dbe4ec;font-size:11px;line-height:1.55');
  radioBox.append(radioLabel, radioText);

  const ambientBox = el(
    'div',
    'position:absolute;right:12px;bottom:12px;max-width:240px;text-align:right;font:10.5px/1.6 ui-monospace,monospace;color:#5d6a77;font-style:italic;opacity:0;transition:opacity .5s ease;pointer-events:none',
  );

  const keys = el(
    'div',
    'position:absolute;left:10px;bottom:10px;font:10px/1.7 ui-monospace,monospace;color:#4f5c68;pointer-events:none;white-space:pre',
  );
  keys.textContent = 'E  the desk\nC  the case file\n1-4  timescale\n`  diagnostics';
  keys.style.opacity = '0.75';

  root.append(bar, quota, plate, prompt, banner, radioBox, ambientBox, keys);
  host.appendChild(root);

  let hover: CitizenDef | null = null;
  let bannerTimer: number | undefined;
  let promptTimer: number | undefined;
  let radioTimer: number | undefined;
  let ambientTimer: number | undefined;

  function paintPlate(): void {
    clear(plate);
    if (!hover) {
      plate.style.opacity = '0';
      return;
    }
    const state = sim.citizenState(hover.id);
    plate.style.opacity = '1';
    plate.append(
      el('div', 'font-size:13px;color:#e6eef6', hover.name),
      el('div', 'color:#8a97a5;font-size:10.5px', hover.archetype),
      el('div', 'margin-top:6px;display:flex;gap:6px;align-items:center', bandChip(fearBand(state?.fear ?? 0)), el('span', 'color:#6f7d8b;font-size:10px', fearWord(state?.fear ?? 0))),
      note('Click to inspect. Three questions, then a decision.'),
    );
  }

  function tick(): void {
    clockLine.textContent = sim.clockText;
    const late = sim.clockText >= '23:00';
    clockLine.style.color = late ? '#e2a19a' : '#e6eef6';

    const done = sim.inspectionsDone;
    subLine.textContent = late ? 'THE GATE CLOSES AT MIDNIGHT' : 'SECTOR 4 · KILN ROW · SHIFT IN PROGRESS';

    clear(quotaBody);
    quotaBody.append(
      el(
        'div',
        `font-size:14px;color:${done >= sim.quotaInspections ? '#a9c79a' : '#e6eef6'}`,
        `inspections ${done}/${sim.quotaInspections}`,
      ),
      el('div', 'color:#8a97a5;font-size:10.5px;margin-top:2px', `docket ${sim.docket.length} card${sim.docket.length === 1 ? '' : 's'}`),
      el('div', 'color:#6f7d8b;font-size:10px;margin-top:4px', sim.phase === 'beat' ? 'beat' : sim.phase),
    );
  }

  return {
    tick,
    setHover(citizen) {
      if (citizen?.id === hover?.id) return;
      hover = citizen;
      paintPlate();
    },
    setPrompt(text) {
      window.clearTimeout(promptTimer);
      if (!text) {
        prompt.style.opacity = '0';
        return;
      }
      prompt.textContent = text;
      prompt.style.opacity = '1';
    },
    radio(text, kind = 'radio') {
      radioLabel.textContent = kind === 'speaker' ? 'loudspeaker' : 'sector control';
      radioText.textContent = text;
      radioBox.style.opacity = '1';
      window.clearTimeout(radioTimer);
      radioTimer = window.setTimeout(() => {
        radioBox.style.opacity = '0';
      }, kind === 'speaker' ? 7000 : 9000);
    },
    ambient(text) {
      ambientBox.textContent = `— ${text}`;
      ambientBox.style.opacity = '1';
      window.clearTimeout(ambientTimer);
      ambientTimer = window.setTimeout(() => {
        ambientBox.style.opacity = '0';
      }, 6000);
    },
    announce(text, ms = 5200) {
      banner.textContent = text;
      banner.style.opacity = '1';
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => {
        banner.style.opacity = '0';
      }, ms);
    },
    destroy() {
      window.clearTimeout(bannerTimer);
      window.clearTimeout(promptTimer);
      window.clearTimeout(radioTimer);
      window.clearTimeout(ambientTimer);
      root.remove();
    },
  };
}

function fearBand(fear: number): 'safe' | 'thin' | 'hanging' {
  if (fear < 0.35) return 'safe';
  if (fear < 0.62) return 'thin';
  return 'hanging';
}

function fearWord(fear: number): string {
  if (fear < 0.35) return 'at ease';
  if (fear < 0.62) return 'watching you';
  return 'frightened';
}
