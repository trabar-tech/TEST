/**
 * A scene on the street: one storylet, its beats, and a choice (P3-T04).
 *
 * The presentation problem here is specific. The game's whole claim is that *paperwork
 * is the mechanism*, so a scene must not feel like a dialogue tree with the sim paused —
 * it has to read like something that happened to the Warden on the way to the desk, and
 * the choice has to look like a decision an officer would actually make, not a morality
 * dial. Hence: beats first, in prose, then the resolutions as labels the Warden would
 * say out loud, and no numbers anywhere on screen.
 *
 * Nothing here reads `truth`; a scene is a claim like everything else.
 */

import { el, button, FONT_MONO, FONT_SERIF } from './dom';
import type { Storylet } from '@core/content';

const C = {
  ink: '#c9d3dd',
  dim: '#7f8d9b',
  faint: '#4d5a67',
  gold: '#d8b06a',
  red: '#c9705f',
  bg: '#0d1013',
  line: 'rgba(120,140,160,.24)',
};

export interface SceneOptions {
  card: Storylet;
  /** shown once, above the card, so the player knows why this is happening now */
  why?: string;
  onResolve: (resolutionId: string) => void;
  onDismiss?: () => void;
}

export interface SceneHandle {
  destroy: () => void;
}

export function createScene(host: HTMLElement, opts: SceneOptions): SceneHandle {
  const overlay = el(
    'div',
    `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;` +
      `background:rgba(4,6,8,.88);z-index:26;padding:24px`,
  );
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', opts.card.title);

  const box = el(
    'div',
    `width:min(620px,94vw);max-height:88vh;overflow:auto;padding:24px 26px;background:${C.bg};` +
      `border:1px solid ${C.line};border-left:3px solid ${C.gold};border-radius:3px;color:${C.ink};font:${FONT_MONO}`,
  );

  box.append(
    el('div', `display:flex;justify-content:space-between;gap:12px;align-items:baseline`,
      el('div', `color:${C.gold};font-size:9.5px;letter-spacing:.2em`, 'ON THE STREET'),
      el('div', `color:${C.faint};font-size:9px`, opts.card.deck.replace(/_/g, ' ')),
    ),
    el('h2', `margin:12px 0 0;font:${FONT_SERIF};font-size:20px;font-weight:400;color:#e4ecf4`, opts.card.title),
  );

  if (opts.why) {
    box.append(el('div', `margin-top:6px;font-size:9.5px;color:${C.faint};line-height:1.5`, opts.why));
  }

  const prose = el('div', `margin:18px 0 20px;display:flex;flex-direction:column;gap:11px`);
  for (const beat of opts.card.beats) {
    prose.append(el('p', `margin:0;font:${FONT_SERIF};font-size:14px;line-height:1.68;color:${C.ink}`, beat.text));
  }
  box.append(prose);

  box.append(
    el('div', `color:${C.faint};font-size:9px;letter-spacing:.14em;margin-bottom:9px`, 'WHAT DO YOU DO'),
  );

  const choices = el('div', 'display:flex;flex-direction:column;gap:7px');
  for (const resolution of opts.card.resolutions) {
    const b = button(resolution.label, () => {
      opts.onResolve(resolution.id);
    }, {
      style:
        `text-align:left;padding:11px 13px;font:${FONT_MONO};font-size:11.5px;line-height:1.5;` +
        `color:${C.ink};background:#11161b;border:1px solid ${C.line};border-radius:3px;cursor:pointer`,
    });
    if (resolution.note) b.title = resolution.note;
    choices.append(b);
  }
  box.append(choices);

  box.append(
    el(
      'div',
      `margin-top:16px;padding-top:12px;border-top:1px solid ${C.line};color:${C.faint};font-size:9px;line-height:1.6`,
      'Whatever you choose here still has to be written up at the desk. The city only knows what you file.',
    ),
  );

  /**
   * Swallow input at the overlay.
   *
   * Playtest, first session: answering a question also *moved the Warden*, because the
   * overlay is a child of the app host and the canvas's click-to-move listener is on that
   * host. A click on a modal is not a click on the world. Fixed here rather than in
   * `main.ts` so every future modal gets it by existing.
   */
  // NB: bubble phase, *not* capture. A capture-phase stopPropagation on a container fires
  // before the event reaches the target, so the modal's own buttons never received their
  // clicks — the overlay swallowed its own controls. Found by a probe, not by reading.
  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel'] as const) {
    overlay.addEventListener(type, (e) => e.stopPropagation());
  }
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());

  overlay.append(box);
  host.append(overlay);

  return {
    destroy: () => overlay.remove(),
  };
}

/** Kept for tests that want the palette without reaching into the module. */
export const SCENE_COLOURS = C;
export const SCENE_ALERT = C.red;
