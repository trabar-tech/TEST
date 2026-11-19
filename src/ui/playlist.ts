/**
 * The G1 playlist: a guided, self-contained session anyone can run in a browser.
 *
 * Gates need three humans, a room and a recorder. What they also need — and what
 * nobody usually builds — is a **protocol the tester cannot get lost in**: a fixed
 * route, a fixed order of events, and prompts that ask the two questions in the
 * gate spec *in the tester's own words*, at the moment they would actually have
 * the answer.
 *
 * So this exists, and it is deliberately not a tutorial. It is a lab script:
 *
 *   SHIFT → STREET → one incident (a quiet raid) → the desk → the audit
 *         → one incident (a loud raid) → the desk → the audit → the two questions
 *
 * Everything is a `<textarea>` and a set of buttons, it works offline, and the
 * answers are copied out as plain text so they can be pasted into the phase doc.
 * A protocol you cannot run without a designer present is not a protocol.
 */

import { el, button, FONT_MONO } from './dom';

const C = {
  ink: '#c9d3dd',
  dim: '#7f8d9b',
  faint: '#4d5a67',
  gold: '#d8b06a',
  red: '#c9705f',
  green: '#a9c79a',
};

export interface PlaylistStep {
  id: string;
  /** what the tester does — imperative, one action */
  task: string;
  /** what to watch for, without telling them what to conclude */
  watch: string;
  /** a prompt they answer in their own words, if any */
  ask?: string;
  /** minutes */
  minutes: number;
}

/**
 * The script from `02-phase-1-record-slice.md` §6 and `03-phase-2-tactical.md` §6,
 * made runnable. The order matters: the quiet raid comes first so that the second
 * raid is measured against a baseline the tester has already experienced.
 */
export const G1_STEPS: readonly PlaylistStep[] = [
  {
    id: 'street',
    task: 'Begin the shift. Walk the street. Click one citizen and inspect them. Do not file anything yet.',
    watch: 'Whether walking and clicking feel found, or found with help.',
    ask: 'Before anything else: what do you think this game is about, in one sentence?',
    minutes: 3,
  },
  {
    id: 'quiet',
    task: 'Go to Block C, flat fourteen (the dashed marker). Get in as quietly as you can. Bring out whoever you find.',
    watch: 'Whether the plan survives contact, and whether they choose a quiet entry unprompted.',
    ask: 'Did you have a plan before you went in? What was it, and what happened to it?',
    minutes: 5,
  },
  {
    id: 'file-quiet',
    task: 'File the incident. Then submit to the audit and read the sheet.',
    watch: 'Whether they read the sheet, and whether they edit what they know is true.',
    ask: 'What did you leave out of that line, and why?',
    minutes: 4,
  },
  {
    id: 'loud',
    task: 'Same flat, or the market corner. This time get in fast. Use force if you like.',
    watch: 'Whether force feels like a *choice with a cost* rather than the obvious option.',
    ask: 'You had a quieter option. Why did you take the one you took?',
    minutes: 5,
  },
  {
    id: 'file-loud',
    task: 'File it — honestly or not. Submit. Read the audit.',
    watch: 'Whether the audit is legible (they can say *why* it flagged what it flagged).',
    ask: 'When the audit found something, could you have predicted it from the form?',
    minutes: 4,
  },
  {
    id: 'g1-tactics',
    task: 'Look back at the two incidents together.',
    watch: 'Listen for the word "planned" versus "chaotic".',
    ask: 'G1 Q1 — was it tactics to you? Did you feel you had a plan that worked or failed legibly?',
    minutes: 2,
  },
  {
    id: 'g1-integration',
    task: 'Now, without scrolling up: describe tonight.',
    watch: 'Whether what they *wrote* is part of what they *did*, unprompted.',
    ask: 'G1 Q2 — describe the shift you just played. Free text, two or three sentences.',
    minutes: 2,
  },
];

export interface PlaylistHandle {
  readonly root: HTMLElement;
  destroy(): void;
  /** the answers so far, as pasteable markdown */
  report(): string;
}

export function createPlaylist(
  host: HTMLElement,
  opts: { onClose: () => void; runId?: string },
): PlaylistHandle {
  const answers = new Map<string, string>();
  const times = new Map<string, number>();
  let index = 0;
  const startedAt = Date.now();

  const root = el(
    'div',
    `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,6,8,.96);z-index:40;font:11.5px ${FONT_MONO};color:${C.ink}`,
  );
  const card = el(
    'div',
    `width:min(620px,94vw);max-height:92vh;overflow:auto;padding:22px 24px;border:1px solid rgba(120,140,160,.3);border-radius:3px;background:#0f1318;display:flex;flex-direction:column;gap:14px`,
  );
  root.append(card);
  host.append(root);

  function step(): PlaylistStep {
    return G1_STEPS[Math.min(index, G1_STEPS.length - 1)]!;
  }

  function render(): void {
    card.replaceChildren();

    const done = index >= G1_STEPS.length;
    const head = el('div', 'display:flex;align-items:baseline;justify-content:space-between;gap:12px');
    head.append(
      el('div', `font-size:9.5px;letter-spacing:.2em;color:${C.dim}`, done ? 'SESSION COMPLETE' : `G1 PLAYLIST · STEP ${index + 1} OF ${G1_STEPS.length}`),
      el('div', `font-size:9.5px;color:${C.faint}`, `~${G1_STEPS.reduce((a, s) => a + s.minutes, 0)} min total`),
    );
    card.append(head);

    if (done) {
      card.append(renderSummary());
      return;
    }

    const s = step();
    card.append(
      el('div', `font-size:15px;line-height:1.5;color:#e6eef6`, s.task),
      el('div', `font-size:11px;line-height:1.6;color:${C.dim}`, `Watch for: ${s.watch}`),
    );

    if (s.ask) {
      card.append(el('div', `font-size:9.5px;letter-spacing:.16em;color:${C.gold}`, 'ANSWER IN YOUR OWN WORDS'));
      const area = el('textarea', [
        'width:100%',
        'min-height:80px',
        'resize:vertical',
        'padding:8px 10px',
        `font:12px/1.6 ${FONT_MONO}`,
        'color:#dbe4ec',
        'background:#12171c',
        'border:1px solid rgba(120,140,160,.28)',
        'border-radius:3px',
        'outline:none',
      ].join(';'));
      area.value = answers.get(s.id) ?? '';
      area.placeholder = 'Type it as you would say it out loud.';
      area.addEventListener('input', () => answers.set(s.id, area.value));
      card.append(area);
    }

    const nav = el('div', 'display:flex;gap:8px;align-items:center;justify-content:space-between');
    const left = el('div', 'display:flex;gap:8px');
    if (index > 0) {
      left.append(button('← back', () => { index -= 1; render(); }, { style: ghost }));
    }
    left.append(
      button('abandon the playlist', () => { root.remove(); opts.onClose(); }, { style: ghost }),
    );

    const right = el('div', 'display:flex;gap:8px');
    right.append(
      button(index === G1_STEPS.length - 1 ? 'Finish' : 'Next →', () => {
        times.set(step().id, Math.round((Date.now() - startedAt) / 1000));
        index += 1;
        render();
      }, { style: primary }),
    );
    nav.append(left, right);
    card.append(nav);
  }

  function renderSummary(): HTMLElement {
    const wrap = el('div', 'display:flex;flex-direction:column;gap:10px');
    wrap.append(
      el('div', `font-size:12px;line-height:1.7;color:${C.ink}`, 
        'Thank you. Everything below is what you said, in your words. Copy it into the phase doc — a gate result nobody wrote down did not happen.'),
    );
    for (const s of G1_STEPS) {
      if (!s.ask) continue;
      const block = el('div', `border-left:2px solid rgba(216,176,106,.35);padding-left:10px;display:flex;flex-direction:column;gap:3px`);
      block.append(
        el('div', `font-size:10px;color:${C.dim}`, s.ask),
        el('div', `font-size:11.5px/1.6 ${FONT_MONO};color:${C.ink};white-space:pre-wrap`, answers.get(s.id) || '(no answer)'),
      );
      wrap.append(block);
    }
    const out = el('textarea', [
      'width:100%',
      'min-height:150px',
      'padding:8px 10px',
      `font:10.5px/1.6 ${FONT_MONO}`,
      'color:#dbe4ec',
      'background:#12171c',
      'border:1px solid rgba(120,140,160,.28)',
      'border-radius:3px',
    ].join(';'));
    out.value = report();
    out.readOnly = true;
    wrap.append(el('div', `font-size:9.5px;letter-spacing:.16em;color:${C.gold}`, 'PASTE THIS INTO THE PHASE DOC'), out);
    wrap.append(
      button('close', () => { root.remove(); opts.onClose(); }, { style: primary }),
    );
    return wrap;
  }

  function report(): string {
    const lines: string[] = [];
    lines.push(`### G1 session · ${opts.runId ?? new Date().toISOString().slice(0, 10)}`);
    lines.push('');
    lines.push('| step | task | answer |');
    lines.push('|---|---|---|');
    for (const s of G1_STEPS) {
      if (!s.ask) continue;
      const a = (answers.get(s.id) ?? '').replace(/\|/g, '/').replace(/\n/g, ' ').trim();
      lines.push(`| ${s.id} | ${s.task.replace(/\|/g, '/')} | ${a || '(no answer)'} |`);
    }
    lines.push('');
    lines.push('**G1 Q1 (tactics):** ' + (answers.get('g1-tactics')?.trim() || 'NOT ANSWERED'));
    lines.push('');
    lines.push('**G1 Q2 (integration):** ' + (answers.get('g1-integration')?.trim() || 'NOT ANSWERED'));
    lines.push('');
    lines.push('**Recorded, non-gating:** ' + JSON.stringify(Object.fromEntries(times)));
    return lines.join('\n');
  }

  render();
  return {
    root,
    report,
    destroy() {
      root.remove();
    },
  };
}

const primary =
  'padding:7px 14px;font:11px ui-monospace,monospace;letter-spacing:.08em;color:#0d1013;background:#d8b06a;border:1px solid #d8b06a;border-radius:3px;cursor:pointer;font-weight:600';
const ghost =
  'padding:6px 11px;font:10.5px ui-monospace,monospace;color:#9aa8b5;background:#151a1f;border:1px solid rgba(120,140,160,.3);border-radius:3px;cursor:pointer';
