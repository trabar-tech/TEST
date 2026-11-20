/**
 * The Desk (P1-T05) — the game's thesis surface (SYS-REC-01 §6).
 *
 * DOM, not canvas: typing has to be typing, Tab has to work, and a text field
 * inside WebGL is a category error. One page, no tabs, no modals.
 *
 * The rule the layout encodes: **the exposure gutter is never hidden**. The
 * player can always see what they can be caught on before they stamp, and the
 * gutter always says *why* on hover. Cutting that would make the audit feel
 * arbitrary, which is the one failure this system cannot absorb.
 */

import type { Simulation, DocketEvent } from '@systems/shift';
import type { Claim, Classification, ForceRung } from '@core/record';
import { riskBand } from '@core/record';
import { actsOf, conflictWarnings } from '@systems/directive-conflicts';
import { bandChip, button, clear, el, label, note, panel } from './dom';

export const TAG_VOCABULARY = [
  'suspicious_conduct',
  'resisting',
  'armed',
  'crowd',
  'contraband',
  'unlicensed_radio',
  'curfew_violation',
  'syndicate',
  'cell',
  'informant',
  'insufficient_papers',
  'property_vandalism',
  'bribe_offered',
  // tactical-layer tags (P2): the vocabulary the incident screen can add
  'forced_entry',
  'excessive_force_risk',
  'lethal_force',
  'no_authorisation',
  'unsearched_premises',
  'crowd_dispersed',
] as const;

const CLASSIFICATIONS: Array<{ code: Classification; name: string; glyph: string }> = [
  { code: 'P', name: 'Pass', glyph: '○' },
  { code: 'C', name: 'Cite', glyph: '◇' },
  { code: 'D', name: 'Detain', glyph: '■' },
  { code: 'X', name: 'Confiscate', glyph: '▤' },
  { code: 'B', name: 'Bribe taken', glyph: '◈' },
  { code: '-', name: 'Nothing seen', glyph: '—' },
  { code: 'R', name: 'Resistance', glyph: '▲' },
  { code: 'NR', name: 'No contact', glyph: '·' },
];

export interface DeskHandle {
  render(): void;
  destroy(): void;
}

export function createDesk(
  sim: Simulation,
  host: HTMLElement,
  opts: { onSubmit: () => void },
): DeskHandle {
  const root = el(
    'div',
    'position:absolute;inset:0;display:grid;grid-template-columns:248px minmax(0,1fr) 252px;gap:0;background:#0d1013;z-index:20',
  );
  // a click on the desk is not a click on the street (same bug as the scene overlay)
  // bubble phase, not capture: a capture-phase stop would swallow the desk's own buttons
  for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }
  host.appendChild(root);

  const state = {
    index: 0,
    drafts: new Map<string, { claim: Claim; tags: Set<string>; free_text: string }>(),
    filed: new Set<string>(),
  };

  function draftFor(event: DocketEvent) {
    let d = state.drafts.get(event.ref);
    if (!d) {
      d = { claim: { ...event.draft }, tags: new Set(event.tags_hint), free_text: '' };
      state.drafts.set(event.ref, d);
    }
    return d;
  }

  function render(): void {
    clear(root);
    const events = sim.docket;
    if (events.length === 0) {
      root.style.gridTemplateColumns = '1fr';
      root.append(
        el(
          'div',
          'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#8a97a5;font:12px/1.7 ui-monospace,monospace;text-align:center;padding:40px',
          el('div', 'font-size:14px;letter-spacing:.2em;color:#c9d3dd', 'NOTHING TO FILE'),
          el('div', 'max-width:44ch', 'You inspected nobody and saw nothing worth writing down. The audit will find that interesting.'),
          button('Submit the empty docket', () => opts.onSubmit(), { style: primaryButton() }),
        ),
      );
      return;
    }

    state.index = Math.min(state.index, events.length - 1);
    const event = events[state.index]!;
    const draft = draftFor(event);

    root.append(docketColumn(), formColumn(event, draft), gutterColumn(event, draft));
  }

  /* ----------------------------------------------------------- docket */

  function docketColumn(): HTMLElement {
    const col = el(
      'div',
      'border-right:1px solid rgba(120,140,160,.18);padding:12px;display:flex;flex-direction:column;gap:8px;overflow:auto;background:#0b0e11',
    );
    col.append(label('docket'), note(`${sim.docket.length} event${sim.docket.length === 1 ? '' : 's'} · quota ${sim.inspectionsDone}/${sim.quotaInspections}`));
    sim.docket.forEach((event, i) => {
      const filed = state.filed.has(event.ref);
      const active = i === state.index;
      const card = el(
        'div',
        [
          'padding:8px 9px',
          'border-radius:3px',
          'cursor:pointer',
          `border:1px solid ${active ? 'rgba(216,176,106,.65)' : 'rgba(120,140,160,.22)'}`,
          `background:${active ? 'rgba(216,176,106,.1)' : '#12171c'}`,
          `color:${filed ? '#6f7d8b' : '#c9d3dd'}`,
          'font:11px ui-monospace,monospace',
        ].join(';'),
      );
      card.append(
        el('div', 'font-size:9px;letter-spacing:.16em;color:#6f7d8b', filed ? 'FILED' : event.kind.toUpperCase()),
        el('div', 'margin-top:3px;line-height:1.4', event.title),
      );
      card.addEventListener('click', () => {
        state.index = i;
        render();
      });
      col.append(card);
    });

    const done = sim.docket.filter((e) => state.filed.has(e.ref)).length;
    col.append(
      el('div', 'margin-top:auto;padding-top:10px;border-top:1px solid rgba(120,140,160,.18)'),
      note(`${done} of ${sim.docket.length} signed`),
      button('Submit to the audit', () => opts.onSubmit(), {
        style: primaryButton(),
        disabled: false,
      }),
    );
    return col;
  }

  /* ------------------------------------------------------------- form */

  function formColumn(event: DocketEvent, draft: ReturnType<typeof draftFor>): HTMLElement {
    const col = el('div', 'padding:14px 18px;overflow:auto;display:flex;flex-direction:column;gap:14px');
    const filed = state.filed.has(event.ref);

    col.append(
      el('div', 'display:flex;align-items:baseline;gap:10px', label('report line'), el('div', 'color:#6f7d8b;font-size:10px', `shift ${sim.state.shift} · ${event.ref}`)),
      el('div', 'font:15px/1.5 ui-monospace,monospace;color:#e6eef6', event.title),
      el('div', 'font:11.5px/1.65 ui-monospace,monospace;color:#93a1af', event.note),
    );

    if (filed) {
      col.append(
        el(
          'div',
          'padding:10px 12px;border:1px solid rgba(169,199,154,.4);background:rgba(169,199,154,.08);border-radius:3px;font:11.5px ui-monospace,monospace;color:#a9c79a',
          'Signed. This line is in the record now; nothing above it can change.',
        ),
      );
    }

    col.append(label('classification'));
    const cls = el('div', 'display:flex;flex-wrap:wrap;gap:5px');
    for (const c of CLASSIFICATIONS) {
      const on = draft.claim.classification === c.code;
      cls.append(
        button(`${c.glyph} ${c.name}`, () => {
          draft.claim.classification = c.code;
          render();
        }, {
          disabled: filed,
          style: radioStyle(on),
          title: `Classify this line as ${c.code}`,
        }),
      );
    }
    col.append(cls);

    col.append(label('force rung'));
    const rungRow = el('div', 'display:flex;gap:5px;align-items:center');
    for (const r of [1, 2, 3, 4, 5] as ForceRung[]) {
      rungRow.append(
        button(String(r), () => {
          draft.claim.force_rung = r;
          render();
        }, {
          disabled: filed,
          style: radioStyle(draft.claim.force_rung === r),
          title: r <= 2 ? 'words' : r === 3 ? 'hands' : 'tools',
        }),
      );
    }
    rungRow.append(
      el('span', 'color:#6f7d8b;font-size:10px;margin-left:6px', ['', 'presence', 'hands on', 'restraint', 'baton', 'firearm'][draft.claim.force_rung] ?? ''),
    );
    col.append(rungRow);

    col.append(label('numbers'));
    col.append(stepper('detainees', draft.claim.detainees, 0, 4, (v) => { draft.claim.detainees = v; render(); }, filed));
    col.append(stepper('damage', draft.claim.damage, 0, 3, (v) => { draft.claim.damage = v; render(); }, filed));

    col.append(label('tags'));
    const tagWrap = el('div', 'display:flex;flex-wrap:wrap;gap:4px');
    for (const tag of TAG_VOCABULARY) {
      const on = draft.tags.has(tag);
      tagWrap.append(
        button(tag, () => {
          if (on) draft.tags.delete(tag);
          else draft.tags.add(tag);
          render();
        }, { disabled: filed, style: chipStyle(on) }),
      );
    }
    col.append(tagWrap);

    // the scene's own record. Everything here was *observed*; striking it is the
    // player's edit, and every strike is a thing the audit can put back.
    if (event.draft.property && event.draft.property.length > 0) {
      col.append(label('what the scene recorded'));
      const propWrap = el('div', 'display:flex;flex-wrap:wrap;gap:4px');
      const all = event.draft.property;
      for (const token of all) {
        const on = draft.claim.property?.includes(token) !== false;
        propWrap.append(
          button(`${on ? '◉' : '○'} ${token.replace(/_/g, ' ')}`, () => {
            const current = draft.claim.property ?? [...all];
            draft.claim.property = on
              ? current.filter((t) => t !== token)
              : [...new Set([...current, token])];
            render();
          }, {
            disabled: filed,
            style: chipStyle(on),
            title: on ? 'Strike this from the line. The scene still recorded it.' : 'Put it back.',
          }),
        );
      }
      col.append(propWrap);
      col.append(
        el(
          'div',
          'color:#6f7d8b;font-size:10px;line-height:1.5',
          'Struck facts are omissions, not absences. The audit reads omissions the way a supervisor does.',
        ),
      );
    }

    col.append(label('your words'));
    const area = el('textarea', [
      'width:100%',
      'min-height:74px',
      'resize:vertical',
      'padding:8px 10px',
      'font:12px/1.6 ui-monospace,monospace',
      'color:#dbe4ec',
      'background:#12171c',
      'border:1px solid rgba(120,140,160,.28)',
      'border-radius:3px',
      'outline:none',
    ].join(';'));
    area.maxLength = 240;
    area.value = draft.free_text;
    area.disabled = filed;
    area.placeholder = 'What the record will say happened.';
    const counter = el('div', 'color:#6f7d8b;font-size:10px;text-align:right', `${draft.free_text.length}/240`);
    area.addEventListener('input', () => {
      draft.free_text = area.value;
      counter.textContent = `${area.value.length}/240`;
    });
    col.append(area, counter);

    col.append(
      button(filed ? 'Signed' : 'Sign and file', () => {
        if (filed) return;
        sim.file(event.ref, {
          claim: draft.claim,
          tags: [...draft.tags],
          free_text: draft.free_text,
        });
        state.filed.add(event.ref);
        // advance to the next unsigned card, so 5 filings are 5 clicks and
        // not 5 clicks plus 5 navigations
        const next = sim.docket.findIndex((e) => !state.filed.has(e.ref));
        if (next >= 0) state.index = next;
        render();
      }, { disabled: filed, style: primaryButton() }),
      note('Free text is optional for the audit and decisive for everyone who reads it later.'),
    );

    return col;
  }

  /* ----------------------------------------------------------- gutter */

  function gutterColumn(event: DocketEvent, draft: ReturnType<typeof draftFor>): HTMLElement {
    const exposure = sim.previewExposure(event, draft.claim);
    const band = riskBand(exposure.risk_score);
    const col = panel('position:relative;border:none;border-left:1px solid rgba(120,140,160,.18);border-radius:0;background:#0b0e11;overflow:auto');
    col.append(label('exposure'), el('div', 'margin:8px 0 4px', bandChip(band)));

    const why = el('div', 'display:flex;flex-direction:column;gap:6px;margin-top:8px');
    if (exposure.cameras.length > 0) {
      for (const cam of exposure.cameras) {
        why.append(reason('◉', `${cam} is in range`, 'A camera in range sees the whole encounter, whatever you write.'));
      }
    } else {
      why.append(reason('○', 'no camera in range', 'Nothing recorded it but you.'));
    }
    if (exposure.witnesses.length > 0) {
      for (const w of exposure.witnesses) {
        const name = sim.citizens.def(w.id)?.name ?? w.id;
        const likely = w.will_talk > 0.5;
        why.append(
          reason(
            likely ? '◉' : '◌',
            `${name} was close enough to see`,
            likely
              ? 'They talk to people. Assume they will talk to the audit.'
              : 'They keep to themselves. That is not the same as silence.',
          ),
        );
      }
    }
    if (exposure.contradictions.length > 0) {
      for (const c of exposure.contradictions) {
        why.append(reason('⚑', `contradicts ${c}`, 'You already filed something that says otherwise this shift.'));
      }
    }
    if (band === 'safe' && draft.claim.classification !== event.draft.classification) {
      why.append(reason('·', 'nobody is watching', 'You can write this and it will stand. That is not the same as true.'));
    }

    // Standing-order contradictions are shown *before* signing. Discovering them
    // on the audit sheet would be a trap, and traps are what this design forbids.
    // the same expansion the audit uses, so the warning and the charge cannot
    // disagree about what the player just did
    const performed = actsOf({ claim: draft.claim, tags: [...draft.tags] });
    for (const warning of conflictWarnings(sim.directives(), performed)) {
      why.append(
        reason('⌖', 'two orders conflict', `${warning} Obeying one is a failure of the other, and the sheet will say which.`),
      );
    }

    // The home: learned by looking, not by guessing. It appears here rather than only
    // on the case file, because "do I file a line naming this household?" is a
    // decision, and decisions belong beside the evidence (P3-T02).
    if (event.edge) {
      const home = el('div', 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(120,140,160,.18)');
      home.append(
        el('div', 'font-size:9px;letter-spacing:.14em;color:#6f7d8b', 'THE HOUSEHOLD'),
        el('div', 'margin-top:4px;font-size:9.5px;color:#c9d3dd;line-height:1.5', event.edge.line),
        el('div', 'margin-top:3px;font-size:9px;color:#4d5a67', event.edge.household_id),
      );
      if (event.edge.discrepancy) {
        home.append(
          reason('⌂', 'the card and the record disagree', `${event.edge.discrepancy}. That is a line you could write.`),
        );
      }
      col.append(home);
    }

    col.append(why);

    col.append(
      el('div', 'margin-top:14px;border-top:1px solid rgba(120,140,160,.18);padding-top:10px'),
      label('what happened'),
      note(event.note),
    );

    if (event.scene) {
      // the tactical layer's own facts, shown where the player cannot edit them
      const s = event.scene;
      col.append(
        el('div', 'margin-top:10px;display:flex;flex-direction:column;gap:3px'),
        label('the scene'),
        fact('entry', s.entry.replace(/_/g, ' ')),
        fact('rooms claimed clear', `${s.roomsCleared}`),
        fact('subjects never found', `${s.unfound}`, s.unfound > 0),
        fact('noise', `${s.loudestNoise} tiles`, s.loudestNoise >= 6),
        fact('heard from the street', s.heardByNeighbours > 0 ? `yes, ${s.heardByNeighbours}×` : 'no', s.heardByNeighbours > 0),
        fact('damage', `${s.damage} / 3`, s.damage >= 2),
        fact('force without authorisation', s.unauthorisedForce ? 'yes' : 'no', s.unauthorisedForce),
      );
      col.append(
        el(
          'div',
          'margin-top:8px;font:10px/1.5 ui-monospace,monospace;color:#6f7d8b;font-style:italic',
          'None of this can be edited here. You can only leave it out.',
        ),
      );
    }

    col.append(
      label('checks'),
      note(
        event.kind === 'inspection'
          ? 'Three field checks were available at the citizen card. Whatever they showed, this form is what the city will know.'
          : event.kind === 'incident'
            ? 'The scene produced its own facts. The form is where you decide which of them the city gets.'
            : 'No card was checked at this event.',
      ),
    );
    return col;
  }

  function fact(name: string, value: string, alarm = false): HTMLElement {
    const row = el('div', 'display:flex;justify-content:space-between;gap:8px;font:10px ui-monospace,monospace');
    row.append(
      el('span', 'color:#6f7d8b;text-transform:uppercase;letter-spacing:.08em', name),
      el('span', `color:${alarm ? '#e2a19a' : '#c9d3dd'}`, value),
    );
    return row;
  }

  function reason(glyph: string, head: string, detail: string): HTMLElement {
    return el(
      'div',
      'font:10.5px/1.45 ui-monospace,monospace;color:#93a1af',
      el('div', 'color:#c9d3dd', `${glyph} ${head}`),
      el('div', 'color:#6f7d8b;margin-left:12px', detail),
    );
  }

  render();
  return {
    render,
    destroy: () => root.remove(),
  };
}

/* ------------------------------------------------------------- fragments */

function stepper(
  name: string,
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
  disabled: boolean,
): HTMLElement {
  const row = el('div', 'display:flex;align-items:center;gap:8px');
  row.append(
    el('div', 'width:74px;color:#8a97a5;font-size:10.5px', name),
    button('−', () => onChange(Math.max(min, value - 1)), { disabled: disabled || value <= min, style: smallButton() }),
    el('div', 'width:18px;text-align:center;font-size:13px;color:#e6eef6', String(value)),
    button('+', () => onChange(Math.min(max, value + 1)), { disabled: disabled || value >= max, style: smallButton() }),
  );
  return row;
}

function primaryButton(): string {
  return [
    'padding:7px 13px',
    'font:11px ui-monospace,monospace',
    'letter-spacing:.06em',
    'color:#0d1013',
    'background:#d8b06a',
    'border:1px solid #d8b06a',
    'border-radius:3px',
    'cursor:pointer',
    'font-weight:600',
  ].join(';');
}

function smallButton(): string {
  return [
    'width:22px',
    'height:22px',
    'font:12px ui-monospace,monospace',
    'color:#c9d3dd',
    'background:#171d23',
    'border:1px solid #333f4a',
    'border-radius:2px',
    'cursor:pointer',
  ].join(';');
}

function radioStyle(on: boolean): string {
  return [
    'padding:4px 9px',
    'font:10.5px ui-monospace,monospace',
    'border-radius:2px',
    on
      ? 'color:#0d1013;background:#d8b06a;border:1px solid #d8b06a;font-weight:600;cursor:pointer'
      : 'color:#c9d3dd;background:#171d23;border:1px solid #333f4a;cursor:pointer',
  ].join(';');
}

function chipStyle(on: boolean): string {
  return [
    'padding:2px 7px',
    'font:10px ui-monospace,monospace',
    'border-radius:10px',
    on
      ? 'color:#0d1013;background:#9fc3d6;border:1px solid #9fc3d6;cursor:pointer'
      : 'color:#8a97a5;background:transparent;border:1px solid rgba(120,140,160,.35);cursor:pointer',
  ].join(';');
}
