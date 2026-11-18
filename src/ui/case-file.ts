/**
 * The Case File — the Record made visible (ADR-0002, P1-T01's payoff).
 *
 * Two things it must do, both of which are cheap here and expensive later:
 *
 *  1. **Show cracks.** A line whose stability has fallen renders visibly broken,
 *     so the player can see which of their own statements are fragile without
 *     being told a number (SYS-REC-01 §5.4).
 *  2. **Never show `truth`.** Not as a hidden field, not as a debug value. The
 *     player's whole relationship with the city runs through claims, and this
 *     screen is where that relationship is legible.
 *
 * The disclaimer at the bottom is the answer to "if the Overwatch is always
 * watching, does that erase the moral dilemma?" — no, because the god's-eye view
 * is a view of *paper*, not of people. You can see the whole city and still not
 * know a single thing that happened in it.
 */

import type { Simulation } from '@systems/shift';
import { riskBand } from '@core/record';
import { bandChip, button, clear, el, label, note, panel } from './dom';

export interface CaseFileHandle {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createCaseFile(sim: Simulation, host: HTMLElement): CaseFileHandle {
  const root = el(
    'div',
    'position:absolute;inset:0;display:none;background:rgba(4,6,8,.9);padding:24px;overflow:auto',
  );
  host.appendChild(root);
  let open = false;

  function render(): void {
    clear(root);
    const lines = sim.record.archive();
    const belief = sim.belief();
    const wrap = el('div', 'max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:14px');

    const head = panel('position:relative;background:#0b0e11');
    head.append(
      el('div', 'display:flex;justify-content:space-between;align-items:baseline;gap:16px',
        el('div', '', label('the case file'), el('div', 'font-size:15px;color:#e6eef6;margin-top:3px', `Shift ${sim.state.shift} · ${lines.length} line${lines.length === 1 ? '' : 's'}`)),
        button('Close', () => close(), {
          style: 'padding:5px 10px;font:11px ui-monospace,monospace;color:#8a97a5;background:transparent;border:1px solid #333f4a;border-radius:3px;cursor:pointer',
        }),
      ),
      note('Everything the city knows about Kiln Row, which is everything anybody wrote down.'),
    );
    wrap.append(head);

    if (lines.length === 0) {
      const empty = panel('position:relative');
      empty.append(note('Nothing has been filed yet. That is itself a filing, of a kind.'));
      wrap.append(empty);
      root.append(wrap);
      return;
    }

    const list = el('div', 'display:flex;flex-direction:column;gap:8px');
    for (const line of lines) {
      const cracked = line.stability < 0.4;
      const dried = line.lifespan <= 0;
      const card = panel(
        `position:relative;border-color:${cracked ? 'rgba(226,161,154,.4)' : 'rgba(120,140,160,.24)'};background:${dried ? '#0a0d10' : '#0f1318'};${dried ? 'opacity:.72;' : ''}`,
      );

      if (cracked) {
        // the crack: a jagged rule across the card, drawn not described
        card.append(
          el(
            'div',
            'position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(93deg,transparent 0%,#e2a19a 12%,transparent 26%,#e2a19a 44%,transparent 58%,#e2a19a 79%,transparent 100%);opacity:.55',
          ),
        );
      }

      const tags = line.tags.length ? line.tags.join(' · ') : 'no tags';
      card.append(
        el(
          'div',
          'display:flex;justify-content:space-between;gap:12px;align-items:baseline',
          el('div', 'font-size:12px;color:#dbe4ec', `r-${line.shift} · ${line.event_ref} · ${line.claim.classification}`),
          el('div', 'display:flex;gap:6px;align-items:center',
            line.authority === 'ai_auto'
              ? el('span', 'font-size:9px;letter-spacing:.12em;color:#e2a19a;border:1px solid rgba(226,161,154,.4);padding:1px 5px;border-radius:2px', 'AUTO-FILED')
              : null,
            dried ? el('span', 'font-size:9px;letter-spacing:.12em;color:#6f7d8b', 'DRIED · PERMANENT') : null,
            bandChip(riskBand(line.exposure.risk_score)),
          ),
        ),
        el('div', 'margin-top:5px;color:#93a1af;font-size:11px;line-height:1.6',
          `force ${line.claim.force_rung} · detainees ${line.claim.detainees} · damage ${line.claim.damage} · ${tags}`),
        line.free_text
          ? el('div', 'margin-top:6px;padding-left:8px;border-left:2px solid rgba(120,140,160,.28);color:#dbe4ec;font-size:11.5px;line-height:1.6;font-style:italic', line.free_text)
          : el('div', 'margin-top:6px;color:#5d6a77;font-size:10.5px;font-style:italic', 'nothing written beyond the fields'),
        el('div', 'margin-top:6px;display:flex;gap:12px;font-size:9.5px;color:#5d6a77',
          el('span', '', `stability ${cracked ? 'cracked' : 'holding'}`),
          el('span', '', dried ? 'cannot be checked again' : `${line.lifespan} shift${line.lifespan === 1 ? '' : 's'} before it dries`),
          el('span', '', line.witnesses.length ? `${line.witnesses.length} witness${line.witnesses.length === 1 ? '' : 'es'}` : 'unwitnessed'),
        ),
      );
      list.append(card);
    }
    wrap.append(list);

    const b = panel('position:relative;background:#0b0e11');
    b.append(
      label('what the sector believes'),
      el('div', 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px',
        stat('resistance', belief.resistance_estimate),
        stat('brutality', belief.brutality_index),
        stat('syndicate', belief.syndicate_presence),
      ),
      el('div', 'margin-top:14px;padding-top:12px;border-top:1px solid rgba(120,140,160,.18);color:#7f8d9b;font-size:10.5px;line-height:1.7', 
        'This is the whole city as the Directorate can see it: every claim, every gap, every silence turned into a line. ' +
        'It cannot show you what happened. It never could.'),
    );
    wrap.append(b);

    root.append(wrap);
  }

  function stat(name: string, value: number): HTMLElement {
    return el('div', '',
      el('div', 'font-size:20px;color:#e6eef6;font-variant-numeric:tabular-nums', String(value)),
      el('div', 'color:#6f7d8b;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase', name),
    );
  }

  function show(): void {
    open = true;
    root.style.display = 'block';
    render();
  }

  function close(): void {
    open = false;
    root.style.display = 'none';
  }

  return {
    open: show,
    close,
    isOpen: () => open,
  };
}
