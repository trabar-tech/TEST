/**
 * The Warden's own reasoning, made visible (P3-T10).
 *
 * The phase doc asks for an AI score inspector so the directors can be tuned. It
 * would be easy — and wrong — to build that as a debug overlay, because the G2
 * failure question is a *player* question: "why did something bad happen to me?"
 * A tester who cannot answer it says "the game just decided to punish me", and
 * that is failure condition 2 (RISK R17).
 *
 * So this panel is written for the player and the designer with the same data:
 * the sector's temperature and why it moved, what the Desk thinks of your habits,
 * the Arbiter's current budget, how close Oversight is, and — for every card the
 * deck considered — the four factors that produced its score, including the ones
 * that were ruled out and the clause that ruled them out.
 *
 * It never reads `truth`. Every number in it came from a claim the player already
 * made, or from the district's public state.
 */

import { el, button, FONT_MONO } from './dom';
import type { ShiftOutput } from '@systems/showrunner';
import { inspectShift } from '@systems/showrunner';
import type { ShowrunnerState } from '@systems/showrunner';

const C = {
  ink: '#c9d3dd',
  dim: '#7f8d9b',
  faint: '#4d5a67',
  gold: '#d8b06a',
  red: '#c9705f',
  green: '#a9c79a',
  bg: '#0f1318',
  line: 'rgba(120,140,160,.3)',
};

export interface InspectorOptions {
  /** called when the panel closes, so the caller can drop its reference */
  onClose?: () => void;
  /** shown when the player's last shift is older than the one being inspected */
  staleNote?: string;
}

/**
 * Open the inspector for one shift's output, plus the persistent state (Known set,
 * sector) that the output was computed against.
 */
export function createInspector(
  host: HTMLElement,
  out: ShiftOutput,
  state: Pick<ShowrunnerState, 'known' | 'sector'>,
  opts: InspectorOptions = {},
): { destroy: () => void } {
  const overlay = el(
    'div',
    `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,6,8,.86);z-index:30`,
  );
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Why this shift happened');

  const box = el(
    'div',
    `width:min(680px,94vw);max-height:86vh;overflow:auto;padding:20px 22px;background:${C.bg};` +
      `border:1px solid ${C.line};border-radius:3px;color:${C.ink};font:${FONT_MONO}`,
  );

  const close = (): void => {
    overlay.remove();
    opts.onClose?.();
  };

  const header = el('div', 'display:flex;align-items:baseline;justify-content:space-between;gap:12px');
  header.append(
    el('div', 'display:flex;flex-direction:column;gap:4px', ''),
    button('Close', close, {
      style: `padding:6px 12px;font:${FONT_MONO};color:${C.dim};background:transparent;border:1px solid ${C.line};border-radius:3px;cursor:pointer`,
    }),
  );
  const titles = header.firstElementChild as HTMLElement;
  titles.append(
    el('div', `color:${C.gold};font-size:11px;letter-spacing:.16em`, `WHY SHIFT ${out.shift} HAPPENED`),
    el('div', `color:${C.faint};font-size:9.5px;letter-spacing:.06em`, 'the same arithmetic the director used — no hidden factor'),
  );
  box.append(header);

  /* -------------------------------------------------- the direct answers */
  const summary = el('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0 18px');
  const cell = (label: string, value: string, tone: string) => {
    const c = el('div', `padding:8px 10px;border:1px solid ${C.line};border-radius:3px`);
    c.append(
      el('div', `color:${C.faint};font-size:8.5px;letter-spacing:.14em`, label),
      el('div', `color:${tone};font-size:17px;margin-top:3px`, value),
    );
    return c;
  };
  const heat = out.temperature;
  summary.append(
    cell('TEMPERATURE', `${heat}`, heat >= 75 ? C.red : heat >= 55 ? C.gold : C.green),
    cell('LEGITIMACY', `${Math.round(out.legitimacy)}`, out.legitimacy < 35 ? C.red : C.ink),
    cell('PACING', out.arbiter.state.toUpperCase(), out.arbiter.state === 'release' ? C.green : C.gold),
    cell('ATTENTION', `${Math.round(out.eye.attention * 100)}%`, out.eye.attention > 0.5 ? C.red : C.dim),
  );
  box.append(summary);

  /* ------------------------------------------------ the reasoning rows */
  const rows = inspectShift(out).filter((r) => !r.label.startsWith('Card '));
  const list = el('div', 'display:flex;flex-direction:column;gap:9px');
  for (const row of rows) {
    const item = el('div', `padding-bottom:8px;border-bottom:1px solid rgba(120,140,160,.12)`);
    const head = el('div', 'display:flex;justify-content:space-between;gap:10px');
    head.append(
      el('span', `color:${C.dim};font-size:10px;letter-spacing:.08em`, row.label.toUpperCase()),
      el('span', `color:${C.ink};font-size:10px`, row.value),
    );
    item.append(head);
    if (row.note) item.append(el('div', `color:${C.faint};font-size:9.5px;margin-top:3px;line-height:1.5`, row.note));
    list.append(item);
  }
  box.append(list);

  /* ---------------------------------------------------- the card maths */
  const eligible = out.trace.filter((t) => t.eligible).sort((a, b) => b.final - a.final);
  const excluded = out.trace.filter((t) => !t.eligible);
  const maths = el('div', 'margin-top:18px');
  maths.append(
    el('div', `color:${C.gold};font-size:10px;letter-spacing:.14em;margin-bottom:8px`, 'WHAT THE DECK CONSIDERED'),
    el(
      'div',
      `color:${C.faint};font-size:9px;margin-bottom:10px`,
      'score = novelty × alignment × pacing × temperature × 0.15 + 0.85 — the 0.85 floor means a card is never impossible, only unlikely',
    ),
  );

  const table = el('div', 'display:flex;flex-direction:column;gap:5px');
  for (const entry of eligible.slice(0, 8)) {
    const line = el('div', 'display:grid;grid-template-columns:1fr 58px;gap:8px;align-items:baseline');
    line.append(
      el(
        'span',
        `font-size:9.5px;color:${C.ink}`,
        `${entry.card.id} — ${entry.card.title}`,
      ),
      el('span', `font-size:9.5px;color:${C.dim};text-align:right`, entry.final.toFixed(2)),
    );
    const factors = el(
      'div',
      `grid-column:1/-1;color:${C.faint};font-size:8.5px;line-height:1.5`,
      `novelty ${entry.novelty} · alignment ${entry.alignment.toFixed(2)} · pacing ${entry.pacing.toFixed(2)} · temperature ${entry.temperature.toFixed(2)}`,
    );
    if (entry.why.length > 0) factors.textContent += ` — ${entry.why.join('; ')}`;
    line.append(factors);
    table.append(line);
  }
  maths.append(table);

  if (excluded.length > 0) {
    maths.append(
      el('div', `color:${C.dim};font-size:9px;letter-spacing:.1em;margin:14px 0 6px`, 'RULED OUT'),
    );
    for (const entry of excluded.slice(0, 8)) {
      maths.append(
        el(
          'div',
          `font-size:9px;color:${C.faint};line-height:1.5`,
          `${entry.card.id} — ${entry.why[0] ?? 'not eligible'}`,
        ),
      );
    }
  }
  box.append(maths);

  /* --------------------------------------------------------- the roster */
  const known = state.known.all();
  box.append(
    el('div', `color:${C.gold};font-size:10px;letter-spacing:.14em;margin:18px 0 8px`, `PEOPLE YOU COULD NAME (${known.length}/12)`),
  );
  if (known.length === 0) {
    box.append(el('div', `color:${C.faint};font-size:9.5px`, 'Nobody yet. A person becomes Known when a record names them.'));
  } else {
    const roster = el('div', 'display:flex;flex-direction:column;gap:4px');
    for (const entry of known) {
      roster.append(
        el('div', `font-size:9.5px;color:${C.ink}`, `${entry.household_id} — ${entry.reason}`),
      );
    }
    box.append(roster);
  }
  // A full set never shows empty slots — eviction *replaces*, so the loss is the
  // people, not the space. Saying "0 slots empty" here would be technically true
  // and completely miss the point.
  const gone = state.known.evictions();
  if (gone.length > 0) {
    const last = gone.slice(-3).map((e) => e.household_id).join(', ');
    box.append(
      el(
        'div',
        `color:${C.faint};font-size:9px;margin-top:8px;line-height:1.5`,
        `${gone.length} ${gone.length === 1 ? 'person has' : 'people have'} gone out of your head — ${last}. They are still out there.`,
      ),
    );
  }

  if (opts.staleNote) {
    box.append(el('div', `color:${C.faint};font-size:9px;margin-top:14px`, opts.staleNote));
  }

  overlay.append(box);
  host.append(overlay);

  // click-outside closes, but only on the backdrop: a mis-click in the panel must
  // not throw away the explanation the player asked for
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return {
    destroy: () => {
      overlay.remove();
    },
  };
}
