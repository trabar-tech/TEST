/**
 * The incident screen: plan on the left, act in the middle, paperwork on the right.
 *
 * This is the tactical layer's one and only face, and the design brief for it is
 * a single sentence: **the form must never leave the screen.** A tactical game
 * that hides the paperwork until the action ends becomes a tactics game with an
 * attached chore. Here the "will be filed" strip is live while you plan, so
 * choosing the shotgun is visibly choosing a sentence in a report.
 *
 * Everything is inline-styled and drawn with CSS boxes: the preview runs in a
 * sandboxed iframe with no network, so no fonts, no images, no libraries.
 */

import type { Vec2 } from '@core/nav';
import type { Incident, HostileState } from '@systems/tactical/incident';
import { ENTRY_METHODS, type EntryMethod } from '@systems/tactical/doors';
import { RUNG_LABEL, SOLO_ORDERS, type ForceRung, type OrderKind } from '@systems/tactical/types';
import { createPlan } from '@render/plan';
import { FONT_MONO, button, el } from './dom';

const C = {
  ink: '#c9d3dd',
  dim: '#7f8d9b',
  faint: '#4d5a67',
  gold: '#d8b06a',
  red: '#c9705f',
  green: '#a9c79a',
  floor: '#1b1f24',
  wall: '#2f3841',
  known: '#242a31',
};

export interface IncidentCallbacks {
  onEnter(room: string, method: EntryMethod): void;
  onClear(room: string): void;
  onOrder(kind: OrderKind): void;
  onForce(target: string, rung: ForceRung): void;
  onDetain(target: string): void;
  onAuthorise(rung: ForceRung): void;
  onStabilise(target: string): void;
  onEnd(): void;
}

export interface IncidentHandle {
  render(): void;
  destroy(): void;
  readonly root: HTMLElement;
}

/**
 * The plan is a canvas of its own (see `src/render/plan.ts`): the incident screen
 * is a document with a map in it, and it must never eat the text cursor. What this
 * function does is size it and hand it to the layout.
 */
export function createIncidentView(
  inc: Incident,
  host: HTMLElement,
  cb: IncidentCallbacks,
  opts: { address: string },
): IncidentHandle {
  /**
   * Full-screen, camera-followed (playtest 2).
   *
   * It used to be three columns with a 460px map in the middle — a document with a diagram in
   * it, which is the wrong frame for a shooter. Now the map *is* the screen and the paperwork
   * is a HUD strip: you are in the building, and the form is what you do afterwards.
   *
   * The old panel reading was not wrong, it was for a different game. `createPlan(..., 460)`
   * still exists for the panel mode, so nothing that depended on it breaks.
   */
  const root = el(
    'div',
    'position:absolute;inset:0;display:flex;flex-direction:column;background:#07090b;z-index:18;font:11px ui-monospace,monospace',
  );

  const topBar = el(
    'div',
    'display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:8px 14px;border-bottom:1px solid rgba(120,140,160,.16);flex:none',
  );
  const health = el('div', `font:10px ${FONT_MONO};letter-spacing:.14em;color:${C.green}`, '● ● ●');
  topBar.append(
    el('div', `font:9.5px ${FONT_MONO};letter-spacing:.22em;color:${C.dim}`, 'INCIDENT · SECTOR 4'),
    el('div', `font:9.5px ${FONT_MONO};color:${C.dim}`, opts.address),
    health,
  );

  const planHolder = el('div', 'position:relative;flex:1;min-height:0;overflow:hidden');
  const plan = createPlan(inc, 460, { camera: true, zoom: 26 });
  plan.canvas.style.width = '100%';
  planHolder.append(plan.canvas);

  // the HUD strip: what used to be the right column, kept because the numbers are the point
  const hudStrip = el(
    'div',
    'display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:6px 14px;border-top:1px solid rgba(120,140,160,.16);flex:none;min-height:30px',
  );

  const actions = el(
    'div',
    'display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 14px;border-top:1px solid rgba(120,140,160,.16);flex:none',
  );

  root.append(topBar, planHolder, hudStrip, actions);

  /**
   * Direct control (playtest 2: "a tactical shooter with bureaucracy sim").
   *
   * WASD moves the Warden; the mouse aims; a click fires. Deliberately the last layer added
   * and the smallest: the incident is still a document with a map in it, and the shot still
   * has to be written up. What it fixes is that the player never controlled the body that was
   * in danger — the plan board ordered it around.
   *
   * Solo only. With a squad the Warden is not in the building, and pretending otherwise would
   * break the force-continuum fiction.
   */
  const keys = new Set<string>();
  const KEY_DIRS: Record<string, { x: number; y: number }> = {
    w: { x: 0, y: -1 },
    a: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    d: { x: 1, y: 0 },
    arrowup: { x: 0, y: -1 },
    arrowleft: { x: -1, y: 0 },
    arrowdown: { x: 0, y: 1 },
    arrowright: { x: 1, y: 0 },
  };

  const applyIntent = (): void => {
    let x = 0;
    let y = 0;
    for (const k of keys) {
      const d = KEY_DIRS[k];
      if (d) {
        x += d.x;
        y += d.y;
      }
    }
    inc.setMoveIntent(x === 0 && y === 0 ? null : { x, y });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (!(k in KEY_DIRS)) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    keys.add(k);
    applyIntent();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (!(k in KEY_DIRS)) return;
    keys.delete(k);
    applyIntent();
  };
  // a lost focus must not leave the Warden walking into a wall forever
  const onBlur = (): void => {
    keys.clear();
    applyIntent();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // the renderer owns the camera, so it owns the inverse projection too
  const toWorld = (e: MouseEvent): { x: number; y: number } => plan.screenToWorld(e.clientX, e.clientY);

  plan.canvas.addEventListener('pointermove', (e) => {
    if (inc.hasSquad) return;
    const p = toWorld(e);
    inc.setAim(Math.atan2(p.y - inc.warden.y, p.x - inc.warden.x));
  });

  plan.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || inc.hasSquad) return;
    e.preventDefault();
    const p = toWorld(e);
    inc.setAim(Math.atan2(p.y - inc.warden.y, p.x - inc.warden.x));
    const shot = inc.fire();
    if (shot.fired) {
      plan.draw();
      render();
    } else if (shot.reason) {
      planHolder.setAttribute('data-shot', shot.reason);
    }
  });

  // the entry options and the subjects are still needed, but they are not the frame: they
  // live in a drawer over the map that opens on demand (Tab) and closes on Escape
  const drawer = el(
    'div',
    'position:absolute;inset:0;display:none;grid-template-columns:minmax(200px,260px) minmax(220px,300px);' +
      'justify-content:space-between;gap:0;pointer-events:none;z-index:2',
  );
  const left = el(
    'div',
    `pointer-events:auto;background:rgba(9,12,15,.94);border-right:1px solid rgba(120,140,160,.18);padding:14px;overflow:auto`,
  );
  const right = el(
    'div',
    `pointer-events:auto;background:rgba(9,12,15,.94);border-left:1px solid rgba(120,140,160,.18);padding:14px;overflow:auto`,
  );
  drawer.append(left, el('div', ''), right);
  planHolder.append(drawer);

  let drawerOpen = false;
  const setDrawer = (open: boolean): void => {
    drawerOpen = open;
    drawer.style.display = open ? 'grid' : 'none';
  };

  host.append(root);

  // -------------------------------------------------------------- left: entry
  function renderLeft(): void {
    left.replaceChildren();
    left.append(
      el('div', `font:9.5px ${FONT_MONO};letter-spacing:.16em;color:${C.dim};margin-bottom:8px`, 'ENTRY'),
      el('div', `font:10.5px/1.6 ${FONT_MONO};color:${C.faint};margin-bottom:10px`, 'Quiet is slow. Fast is loud. Loud is a line in a report.'),
    );

    const officers = inc.squad?.size ?? 1;
    for (const room of inc.json.rooms) {
      const known = inc.visibilities.get(room.id) === 'known';
      const row = el('div', 'margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(120,140,160,.12)');
      row.append(
        el('div', `font:10.5px ${FONT_MONO};color:${known ? C.gold : C.ink};margin-bottom:4px`, room.label.toUpperCase()),
      );
      if (!known) {
        row.append(el('div', `font:9.5px/1.5 ${FONT_MONO};color:${C.faint};font-style:italic;margin-bottom:5px`, silhouette(inc, room.id)));
        for (const m of ENTRY_METHODS) {
          if (officers < m.minOfficers) continue;
          const b = button(`${m.label}`, () => cb.onEnter(room.id, m.id), {
            style: entryBtnStyle,
            title: `noise ${m.noiseRadius} · ${m.time}s · legitimacy ${m.legitimacy}`,
          });
          row.append(b);
        }
      } else {
        const visible = inc.visibleHostiles(room.id);
        row.append(
          el(
            'div',
            `font:9.5px/1.5 ${FONT_MONO};color:${visible.length ? C.red : C.green};margin-bottom:5px`,
            visible.length ? `${visible.length} subject(s) visible` : 'appears empty',
          ),
        );
        row.append(
          button('Clear the room', () => cb.onClear(room.id), { style: entryBtnStyle, title: 'A claim, not a fact.' }),
        );
      }
      left.append(row);
    }

    if (inc.authorisation) {
      const a = inc.authorisation;
      left.append(
        el(
          'div',
          `font:9.5px/1.5 ${FONT_MONO};color:${a.denied ? C.red : C.gold};margin-top:6px`,
          a.denied ? 'FIELD AUTHORISATION DENIED' : `authorisation open · rung ${a.rung}`,
        ),
      );
    }
  }

  function silhouette(inc: Incident, roomId: string): string {
    const hit = inc.recon().find((r) => r.room === roomId);
    return hit?.hint ?? 'no entrance';
  }

  /** What the force continuum says, in three words rather than a table. */
  function humanForce(inc: Incident): string {
    const rung = Math.max(1, ...inc.forceUsed.map((f) => f.rung));
    return ['', 'PRESENCE', 'HANDS ON', 'RESTRAINT', 'BATON', 'FIREARM'][rung] ?? 'PRESENCE';
  }

  /** Three pips, so the player can read their own condition at a glance. */
  function woundPips(inc: Incident): string {
    const filled = Math.max(0, inc.wardenHealth);
    return `${'● '.repeat(filled)}${'○ '.repeat(3 - filled)}`.trim();
  }

  // ------------------------------------------------------------ middle: actions
  function renderMiddle(): void {
    plan.draw();

    actions.replaceChildren();
    const verbs: OrderKind[] = inc.hasSquad ? ['stack', 'breach', 'clear', 'hold', 'move', 'detain', 'regroup'] : [...SOLO_ORDERS];
    for (const v of verbs) {
      actions.append(
        button(v.toUpperCase(), () => cb.onOrder(v), {
          style:
            'padding:5px 9px;font:9.5px ui-monospace,monospace;letter-spacing:.1em;color:#c9d3dd;background:#151a1f;border:1px solid rgba(120,140,160,.3);border-radius:2px;cursor:pointer',
        }),
      );
    }
    actions.append(
      button('END THE INCIDENT', () => cb.onEnd(), {
        style:
          'padding:5px 9px;font:9.5px ui-monospace,monospace;letter-spacing:.1em;color:#0d1013;background:#d8b06a;border:1px solid #d8b06a;border-radius:2px;cursor:pointer;font-weight:600',
      }),
    );

    const comms = el('div', `display:flex;flex-direction:column;gap:2px;margin-left:auto;max-width:340px`);
    if (inc.squad) {
      for (const s of inc.squad.snapshot(inc.simSeconds)) {
        const row = el('div', `display:flex;align-items:center;gap:6px`);
        row.append(
          el('div', `font:9.5px ${FONT_MONO};color:${s.wound === 'healthy' ? C.dim : C.red};flex:none;width:74px`, s.name.toUpperCase()),
        );
        // each queued order is its own chip: the queue is the thing the player
        // authored, so it has to be editable, not just legible
        s.queue.forEach((q, i) => {
          const chip = el(
            'span',
            `padding:1px 4px;border:1px solid rgba(120,140,160,.3);border-radius:2px;font:9px ${FONT_MONO};color:${C.ink};cursor:pointer`,
            String(q),
          );
          chip.title = 'move to the front · shift-click to drop';
          chip.addEventListener('click', (ev) => {
            if (ev.shiftKey) inc.squad?.cancel(s.id, i);
            else inc.squad?.reorder(s.id, i, 0);
            render();
          });
          row.append(chip);
        });
        if (s.queue.length === 0) row.append(el('span', `font:9px ${FONT_MONO};color:${C.faint}`, 'idle'));
        if (s.ack) row.append(el('span', `font:9px ${FONT_MONO};color:${C.gold}`, `“${s.ack}”`));
        comms.append(row);
      }
    } else {
      comms.append(
        el('div', `font:9.5px ${FONT_MONO};color:${C.dim}`, `NO SQUAD · FOCUS ${(inc.focusStamina * 100).toFixed(0)}%`),
      );
    }
    actions.append(comms);

    // the HUD strip: what the right column used to say, in one line
    hudStrip.replaceChildren(
      el('div', `font:9.5px ${FONT_MONO};color:${C.dim}`, `FORCE ${humanForce(inc)}`),
      el('div', `font:9.5px ${FONT_MONO};color:${inc.unauthorisedForce ? C.red : C.dim}`, inc.unauthorisedForce ? 'NO AUTHORISATION' : 'AUTHORISED'),
      el('div', `font:9.5px ${FONT_MONO};color:${C.dim}`, `DETAINED ${inc.detainees} · CASUALTIES ${inc.casualties}`),
      el('div', `font:9.5px ${FONT_MONO};color:${C.faint}`, 'TAB · entry + subjects   ESC · close'),
    );

    health.textContent = woundPips(inc);
    health.style.color = inc.wardenHealth > 1 ? C.green : C.red;
  }

  // ---------------------------------------------------------- right: the form
  function renderRight(): void {
    right.replaceChildren();
    right.append(
      el('div', `font:9.5px ${FONT_MONO};letter-spacing:.16em;color:${C.dim};margin-bottom:8px`, 'WILL BE FILED'),
    );

    const known = inc.json.rooms.filter((r) => inc.visibilities.get(r.id) === 'known');
    const force = [...inc.hostiles.values()].filter((h) => h.spotted || inc.forceUsed.some((f) => f.hostile === h.id));
    const rung = inc.forceUsed.reduce<ForceRung>((a, f) => (f.rung > a ? f.rung : a), 1);

    const lines: Array<[string, string, string]> = [
      ['entry', inc.entryUsed ?? '—', C.ink],
      ['rooms entered', `${known.length}`, C.ink],
      ['force', `${rung} · ${RUNG_LABEL[rung]}`, rung >= 3 ? C.red : C.ink],
      ['damage', `${inc.damage} / 3`, inc.damage >= 2 ? C.red : C.ink],
      ['detainees', `${inc.detainees}`, C.ink],
      ['noise', `${Math.max(0, ...inc.noises.map((n) => n.radius))} tiles`, C.ink],
      ['unauthorised', inc.unauthorisedForce ? 'yes' : 'no', inc.unauthorisedForce ? C.red : C.dim],
    ];
    for (const [k, v, colour] of lines) {
      const row = el('div', 'display:flex;justify-content:space-between;gap:6px;padding:2px 0;border-bottom:1px solid rgba(120,140,160,.08)');
      row.append(
        el('span', `font:9.5px ${FONT_MONO};color:${C.faint};text-transform:uppercase;letter-spacing:.1em`, k),
        el('span', `font:10px ${FONT_MONO};color:${colour};text-align:right`, v),
      );
      right.append(row);
    }

    right.append(el('div', `font:9.5px ${FONT_MONO};letter-spacing:.16em;color:${C.dim};margin:12px 0 6px`, 'SUBJECTS'));

    if (force.length === 0) {
      right.append(el('div', `font:9.5px/1.5 ${FONT_MONO};color:${C.faint};font-style:italic`, 'Nobody found yet. You cannot write up what you never saw.'));
    }
    for (const h of force) {
      right.append(hostileBlock(h));
    }
  }

  function hostileBlock(h: HostileState): HTMLElement {
    const block = el('div', 'margin-bottom:10px;padding:6px;border:1px solid rgba(120,140,160,.14);border-radius:2px');
    block.append(
      el(
        'div',
        `font:10px ${FONT_MONO};color:${h.detained ? C.green : h.wound === 'dead' ? C.faint : C.ink};margin-bottom:3px`,
        `${h.id} · ${h.archetype}${h.detained ? ' · DETAINED' : h.stabilised ? ' · STABILISED' : ''}`,
      ),
      el('div', `font:9px ${FONT_MONO};color:${C.faint};margin-bottom:5px`, `compliance ${h.compliance} · ${h.wound}`),
    );
    const rungs: ForceRung[] = [2, 3, 4, 5];
    const row = el('div', 'display:flex;gap:3px;flex-wrap:wrap');
    for (const r of rungs) {
      row.append(
        button(`${r}`, () => cb.onForce(h.id, r), {
          style: `padding:2px 6px;font:9px ui-monospace,monospace;color:${r >= 4 ? '#e2a19a' : '#c9d3dd'};background:#151a1f;border:1px solid ${r >= 4 ? 'rgba(201,112,95,.45)' : 'rgba(120,140,160,.3)'};border-radius:2px;cursor:pointer`,
          title: `rung ${r} — ${RUNG_LABEL[r]}`,
        }),
      );
    }
    block.append(row);
    if (h.compliance >= 60 && !h.detained) {
      block.append(button('Detain', () => cb.onDetain(h.id), { style: smallBtn }));
    }
    if (h.wound === 'down' && !h.stabilised) {
      block.append(button('Stabilise (becomes a witness)', () => cb.onStabilise(h.id), { style: smallBtn }));
    }
    if (!h.detained && h.compliance >= 60) block.append(el('div', `font:9px ${FONT_MONO};color:${C.green};margin-top:3px`, '→ can be detained'));
    return block;
  }

  function render(): void {
    renderLeft();
    renderMiddle();
    renderRight();
  }

  /**
   * Tab opens the drawer, Escape closes it. Discoverable because the HUD strip says so —
   * playtest 1 never found the tactical layer at all, and an undocumented verb is the same
   * mistake one level down.
   */
  const onDrawerKey = (e: KeyboardEvent): void => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setDrawer(!drawerOpen);
    } else if (e.key === 'Escape' && drawerOpen) {
      e.preventDefault();
      setDrawer(false);
    }
  };
  window.addEventListener('keydown', onDrawerKey);

  /**
   * The camera canvas has to be told its box, because it no longer derives its height from the
   * map. Observe the holder rather than `window` so sidebars or a browser chrome change are
   * both covered.
   */
  const fit = (): void => {
    const w = planHolder.clientWidth || 460;
    const h = planHolder.clientHeight || Math.round(window.innerHeight * 0.72);
    plan.resize(w, h);
    plan.draw();
  };
  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  observer?.observe(planHolder);
  queueMicrotask(fit);

  render();
  return {
    root,
    render,
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onDrawerKey);
      observer?.disconnect();
      keys.clear();
      inc.setMoveIntent(null);
      root.remove();
    },
  };
}

const entryBtnStyle =
  'display:block;width:100%;margin:2px 0;padding:3px 6px;text-align:left;font:9.5px ui-monospace,monospace;color:#c9d3dd;background:#151a1f;border:1px solid rgba(120,140,160,.22);border-radius:2px;cursor:pointer';

const smallBtn =
  'display:block;width:100%;margin-top:3px;padding:2px 6px;font:9px ui-monospace,monospace;color:#c9d3dd;background:#151a1f;border:1px solid rgba(120,140,160,.28);border-radius:2px;cursor:pointer';

/** Exposed for tests: the plan is deterministic for a given incident state. */
export function planSignature(inc: Incident): string {
  const rooms = inc.json.rooms.map((r) => `${r.id}:${inc.visibilities.get(r.id)}`).join(',');
  const doors = [...inc.doors.values()].map((d) => `${d.id}:${d.state}`).join(',');
  const hostiles = [...inc.hostiles.values()].map((h) => `${h.id}:${h.spotted ? 'seen' : 'unseen'}`).join(',');
  return `${rooms}|${doors}|${hostiles}`;
}

export type { Vec2 };
