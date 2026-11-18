/**
 * The inspection surface: the card, the three checks, and the conversation
 * (SYS-REC-01 §2).
 *
 * The card is a *document you read*, so it is set in a serif face on paper —
 * the one place in the game that is not a terminal. The conversation is
 * monospace, because it is being written down as it happens.
 */

import type { Simulation } from '@systems/shift';
import { QUESTIONS, TELLS, type CheckResult, type QuestionId } from '@systems/inspection';
import type { Classification } from '@core/record';
import { button, clear, el, label, note, panel } from './dom';

export interface InspectionPanelHandle {
  render(): void;
  destroy(): void;
}

const PAPER = '#e8e2d4';
const INK = '#22242a';

export function createInspectionPanel(
  sim: Simulation,
  host: HTMLElement,
  onClose: () => void,
): InspectionPanelHandle {
  const root = el(
    'div',
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,6,8,.72)',
  );
  host.appendChild(root);

  function render(): void {
    clear(root);
    const insp = sim.inspection;
    if (!insp) {
      onClose();
      return;
    }
    const def = sim.citizens.def(insp.citizenId);
    if (!def) {
      onClose();
      return;
    }

    const sheet = el(
      'div',
      'display:grid;grid-template-columns:minmax(0,320px) minmax(0,380px);gap:16px;max-width:min(760px,94vw);max-height:88vh;overflow:auto',
    );

    /* ------------------------------------------------------------ the card */
    const card = el(
      'div',
      `background:${PAPER};color:${INK};padding:18px 20px;border-radius:2px;box-shadow:0 18px 50px rgba(0,0,0,.6);font-family:Iowan Old Style, Palatino, Georgia, serif`,
    );
    card.append(
      el('div', 'font-size:9.5px;letter-spacing:.22em;color:#6b6558;font-family:ui-monospace,monospace', 'CIVIL REGISTRY · SECTOR 4'),
      el('div', 'font-size:17px;margin-top:6px;letter-spacing:.02em', def.papers.name),
      el('div', 'font-size:11px;color:#5d5749;margin-top:1px', def.archetype),
    );

    const table = el('div', 'margin-top:12px;display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12px');
    const rows: Array<[string, string, boolean]> = [
      ['District', def.papers.district_stamp, false],
      ['Ration', def.papers.ration_class, false],
      ['Permit', def.papers.work_permit, false],
      ['Curfew', def.papers.curfew_pass ? 'PRESENTED' : 'not presented', false],
      ['Chip', def.papers.chip_serial, true],
    ];
    for (const [k, v, mono] of rows) {
      table.append(
        el('div', 'color:#6b6558;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding-top:2px', k),
        el('div', mono ? 'font-family:ui-monospace,monospace;letter-spacing:.06em' : '', v),
      );
    }
    card.append(table, renderChecks(insp.checks), note2('The seal is stamped into the card. You have not looked at it properly.'));

    /* ------------------------------------------------------ conversation */
    const talk = panel('position:relative;display:flex;flex-direction:column;gap:10px');
    talk.append(label('inspection'), el('div', 'font-size:13px;color:#e6eef6', def.name));

    const transcript = el('div', 'display:flex;flex-direction:column;gap:8px;min-height:150px;max-height:34vh;overflow:auto;padding-right:2px');
    if (insp.transcript.length === 0) {
      transcript.append(note('Three questions. Choose them.)'.replace(')', '')));
    }
    for (const entry of insp.transcript) {
      transcript.append(
        el(
          'div',
          'border-left:2px solid rgba(120,140,160,.3);padding-left:8px',
          el('div', 'color:#8a97a5;font-size:10.5px', entry.question),
          el('div', 'color:#dbe4ec;font-size:12px;line-height:1.5;margin-top:2px', entry.answer),
          entry.tell
            ? el('div', 'color:#d8b06a;font-size:10.5px;margin-top:3px;font-style:italic', `⚑ ${TELLS[entry.tell].text}`)
            : null,
        ),
      );
    }
    talk.append(transcript);

    const remaining = 3 - insp.asked.length;
    const askRow = el('div', 'display:flex;flex-wrap:wrap;gap:5px');
    if (remaining > 0) {
      for (const q of QUESTIONS) {
        const used = insp.asked.includes(q.id);
        askRow.append(
          button(q.text, () => {
            sim.askQuestion(q.id);
            render();
          }, {
            disabled: used,
            style: chipStyle(used),
          }),
        );
      }
    } else {
      askRow.append(el('div', 'color:#6f7d8b;font-size:10.5px', 'No more questions. They will wait.'));
    }
    talk.append(askRow);

    if (!insp.fullCheckDone) {
      talk.append(
        button('Full check · 20 s · draws attention', () => {
          sim.fullCheck();
          render();
        }, {
          style:
            'align-self:flex-start;padding:5px 10px;font:11px ui-monospace,monospace;color:#d8b06a;background:rgba(216,176,106,.12);border:1px solid rgba(216,176,106,.5);border-radius:3px;cursor:pointer',
        }),
      );
    } else {
      talk.append(note('Full check done. Command will see the time you spent here.'));
    }

    /* ------------------------------------------------------------ outcomes */
    const outcomes = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:2px');
    const decides: Array<{ code: Classification; label: string; hint: string }> = [
      { code: 'P', label: 'Pass', hint: 'Counts as an inspection if you checked.' },
      { code: 'C', label: 'Cite', hint: 'A violation on the card.' },
      { code: 'D', label: 'Detain', hint: 'They come with you.' },
      { code: 'X', label: 'Confiscate', hint: 'The papers stay.' },
      { code: '-', label: 'See nothing', hint: 'Nothing is recorded. Quota does not move.' },
    ];
    for (const d of decides) {
      outcomes.append(
        button(d.label, () => {
          sim.resolveInspection(d.code);
          onClose();
        }, {
          title: d.hint,
          style:
            'padding:6px 11px;font:11px ui-monospace,monospace;letter-spacing:.04em;color:#c9d3dd;background:#171d23;border:1px solid #333f4a;border-radius:3px;cursor:pointer',
        }),
      );
    }
    talk.append(label('decision'), outcomes, note('Whatever you decide, you will write it up at the desk.'));

    sheet.append(card, talk);
    root.append(sheet);
  }

  function renderChecks(checks: CheckResult[]): HTMLElement {
    const wrap = el('div', 'margin-top:14px;border-top:1px solid #bdb6a6;padding-top:10px');
    wrap.append(el('div', 'font-size:9.5px;letter-spacing:.2em;color:#6b6558;font-family:ui-monospace,monospace', 'AUTHORITY CHECKS'));
    for (const c of checks) {
      wrap.append(
        el(
          'div',
          `display:flex;gap:8px;align-items:baseline;margin-top:5px;font-size:11.5px;color:${c.pass ? '#3f5340' : '#8b1f29'}`,
          el('span', 'font-family:ui-monospace,monospace;width:11px', c.pass ? '✓' : '✗'),
          el('span', '', `${c.label}: ${c.examined}`),
        ),
        el('div', 'font-size:10px;color:#6b6558;margin:1px 0 0 19px;line-height:1.45', c.detail),
      );
    }
    return wrap;
  }

  render();
  return { render, destroy: () => root.remove() };
}

function chipStyle(used: boolean): string {
  return [
    'padding:4px 8px',
    'font:10.5px ui-monospace,monospace',
    'border-radius:2px',
    used
      ? 'color:#4b5560;background:transparent;border:1px solid rgba(120,140,160,.18);cursor:default'
      : 'color:#c9d3dd;background:#171d23;border:1px solid #333f4a;cursor:pointer',
  ].join(';');
}

function note2(text: string): HTMLElement {
  return el('div', 'margin-top:10px;font-size:10px;color:#7a7364;font-style:italic', text);
}

export type { QuestionId };
