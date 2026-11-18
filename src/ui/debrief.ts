/**
 * The stamped consequence sheet and the next shift's briefing (P1-T06 / P1-T07).
 *
 * This screen is the audit's voice. It must be *legible above all*: every line
 * names the line it is about and the reason it exists. If a player ever thinks
 * "why did that happen", this screen failed, not the algorithm.
 */

import type { Simulation } from '@systems/shift';
import type { AuditResult } from '@systems/audit';
import { button, clear, el, label, note, panel } from './dom';

export interface DebriefHandle {
  render(result: AuditResult): void;
  destroy(): void;
}

export function createDebrief(
  sim: Simulation,
  host: HTMLElement,
  opts: { onRestart: () => void },
): DebriefHandle {
  const root = el(
    'div',
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,6,8,.86)',
  );
  host.appendChild(root);

  function render(result: AuditResult): void {
    clear(root);
    const sheet = el(
      'div',
      'width:min(620px,92vw);max-height:88vh;overflow:auto;background:#0f1318;border:1px solid rgba(120,140,160,.28);border-radius:3px;padding:18px 20px;font:11.5px/1.7 ui-monospace,monospace;color:#c9d3dd',
    );

    // the stamp: a rotated block, because the fiction says this is a physical sheet
    const stamp = el(
      'div',
      [
        'position:absolute',
        'top:14px',
        'right:18px',
        'padding:6px 12px',
        'transform:rotate(-7deg)',
        `border:2px solid ${result.review ? '#a8493f' : result.findings.length ? '#d8b06a' : '#6f8f6a'}`,
        `color:${result.review ? '#e2a19a' : result.findings.length ? '#d8b06a' : '#a9c79a'}`,
        'font-size:11px',
        'letter-spacing:.18em',
        'font-weight:600',
        'opacity:.9',
      ].join(';'),
      result.review ? 'REFERRED' : result.findings.length ? 'MARKED' : 'CLEARED',
    );
    sheet.style.position = 'relative';

    sheet.append(
      el('div', 'color:#6f7d8b;letter-spacing:.16em;font-size:9.5px', `SHIFT ${sim.state.shift} · NIGHT AUDIT`),
      el('div', 'font-size:15px;color:#e6eef6;margin:4px 0 12px', 'Compliance sheet'),
      stamp,
    );

    const lines = el('div', 'display:flex;flex-direction:column;gap:7px');
    for (const s of result.sheet) {
      const isVerdict = s.startsWith('REVIEW') || s.startsWith('NOTED') || s.startsWith('CLEARED');
      lines.append(
        el(
          'div',
          isVerdict
            ? `margin-top:6px;padding-top:8px;border-top:1px solid rgba(120,140,160,.2);color:${s.startsWith('REVIEW') ? '#e2a19a' : s.startsWith('NOTED') ? '#d8b06a' : '#a9c79a'}`
            : 'padding-left:2px',
          s,
        ),
      );
    }
    sheet.append(lines);

    /* ------------------------------------------------- what the city now believes */
    const belief = sim.belief();
    const b = panel('position:relative;margin-top:16px;background:#0b0e11');
    b.append(
      label('sector belief'),
      note('This is computed from what was written, not from what happened.'),
    );
    const rows: Array<[string, number, string]> = [
      ['resistance estimate', belief.resistance_estimate, 'under-reported resistance grows the Cell'],
      ['brutality index', belief.brutality_index, 'reported force licenses more force'],
      ['syndicate presence', belief.syndicate_presence, 'ignored routes stay open'],
    ];
    for (const [name, value, gloss] of rows) {
      b.append(
        el(
          'div',
          'display:flex;justify-content:space-between;gap:10px;margin-top:6px;font-size:11px',
          el('span', 'color:#93a1af', name),
          el('span', { color: value > 0 ? '#e6eef6' : '#6f7d8b', fontVariantNumeric: 'tabular-nums' } as Partial<CSSStyleDeclaration>, String(value)),
        ),
        el('div', 'color:#5d6a77;font-size:9.5px;margin-left:0', gloss),
      );
    }
    sheet.append(b);

    /* --------------------------------------------- the next shift's briefing */
    const next = nextBriefing(result, belief);
    const briefing = panel('position:relative;margin-top:10px;background:#0b0e11;border-color:rgba(216,176,106,.3)');
    briefing.append(label('tomorrow · 05:40'), el('div', 'margin-top:6px;color:#dbe4ec;line-height:1.7', next.text));
    if (next.reason) briefing.append(note(next.reason));
    sheet.append(briefing);

    sheet.append(
      el(
        'div',
        'display:flex;gap:8px;margin-top:16px;align-items:center',
        button('Take the next shift', () => opts.onRestart(), {
          style:
            'padding:7px 13px;font:11px ui-monospace,monospace;color:#0d1013;background:#d8b06a;border:1px solid #d8b06a;border-radius:3px;cursor:pointer;font-weight:600',
        }),
        button('Read the record', () => opts.onRestart(), {
          style:
            'padding:7px 13px;font:11px ui-monospace,monospace;color:#8a97a5;background:transparent;border:1px solid #333f4a;border-radius:3px;cursor:pointer',
        }),
      ),
    );

    root.append(sheet);
  }

  render(sim.lastAudit ?? { findings: [], review_risk: 0, review: false, destabilised: [], sheet: [] });
  return { render, destroy: () => root.remove() };
}

/**
 * P1-T07: one visible consequence. If the paperwork under-reported resistance,
 * command re-tasks resources — and the briefing says so, in the regime's voice,
 * without ever admitting it is the audit's fault.
 */
export function nextBriefing(
  result: AuditResult,
  belief: { resistance_estimate: number; brutality_index: number; syndicate_presence: number },
): { text: string; reason: string | null } {
  if (result.review) {
    return {
      text:
        'Warden. Your sheet was referred. A compliance officer will accompany the morning patrol. ' +
        'Your quota stands.',
      reason: 'Compliance Review: harsher audits, no requisition, for the whole of the next shift.',
    };
  }
  if (belief.resistance_estimate === 0 && belief.brutality_index >= 2) {
    return {
      text:
        'Sector command has noted a high force application rate in Kiln Row. Additional restraint ' +
        'equipment is being issued to your post.',
      reason: 'Your own filings said "force" more often than the sector average.',
    };
  }
  if (belief.resistance_estimate === 0) {
    return {
      text:
        'Sector command has re-tasked aerial surveillance away from Kiln Row. Manpower is required ' +
        'elsewhere. Your inspection quota is unchanged.',
      reason: 'Nothing in your filings suggested organised resistance, so the sector is being treated as quiet.',
    };
  }
  return {
    text:
      'Sector command has flagged Kiln Row for a Cell sweep. Expect plain-clothes observers on the ' +
      'east gate road and a heavier incident load.',
    reason: 'Your filings describe resistance activity, so the sector is being treated as hostile.',
  };
}
