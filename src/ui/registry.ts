/**
 * The Registry: the sector's households, and the twelve people you can name.
 *
 * G2 passes question 3 if a tester can name three citizens unprompted. That is a
 * memory question, and memory needs *access*: a place where a person can go and look
 * at who they know, and notice when the list has changed without them.
 *
 * Two things this screen does that a roster usually does not:
 *
 *  - **It shows the households you do *not* know**, as an undifferentiated mass with
 *    numbers. The contrast is the point: twelve names against sixty records is what
 *    the apophenia budget feels like from the inside.
 *  - **It shows the evicted**, by name, in a separate column that only grows. There
 *    is no way to get someone back. That is the cheapest emotional beat in the game
 *    and it deserves a column rather than a toast.
 *
 * Nothing here reads `truth`. Every name is a materialised citizen, and every reason
 * is a claim the player made.
 */

import { el, button, FONT_MONO, FONT_SERIF } from './dom';
import {
  KnownSet,
  describeHousehold,
  materialise,
  type Household,
  type MaterialisedAgent,
  type SectorState,
} from '@systems/households';

const C = {
  ink: '#c9d3dd',
  dim: '#7f8d9b',
  faint: '#4d5a67',
  gold: '#d8b06a',
  red: '#c9705f',
  green: '#a9c79a',
  bg: '#0d1013',
  line: 'rgba(120,140,160,.22)',
};

export interface RegistryOptions {
  /** the campaign seed: the same household is the same person, always */
  seed: number;
  onClose?: () => void;
  /** called when the player chooses to go and see someone */
  onVisit?: (householdId: string) => void;
}

export interface RegistryHandle {
  destroy: () => void;
  /** re-render after the Known set changed */
  refresh: () => void;
}

/**
 * A face, deterministically, with no assets and no network.
 *
 * `face_seed` picks hue and geometry, so the same person looks the same on every
 * screen and across reloads. It will not win an art prize; it is doing the job a
 * portrait does — making twelve people distinguishable at a glance.
 */
export function drawFace(canvas: HTMLCanvasElement, faceSeed: number): void {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  const hue = faceSeed % 360;
  const band = Math.floor(faceSeed / 360) % 5;
  // a plain dark plate with a figure on it: the regime has no interest in beauty
  ctx.fillStyle = '#11161b';
  ctx.fillRect(0, 0, w, h);

  // head
  ctx.fillStyle = `hsl(${hue}, 18%, ${34 + band * 4}%)`;
  const headR = w * 0.19;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.40, headR, headR * 1.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // shoulders
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h);
  ctx.quadraticCurveTo(w * 0.5, h * 0.56, w * 0.82, h);
  ctx.closePath();
  ctx.fill();

  // a distinguishing mark: a scar, a bandage, a bald patch — the thing you remember
  ctx.strokeStyle = `hsl(${(hue + 40) % 360}, 30%, 62%)`;
  ctx.lineWidth = Math.max(1, w * 0.012);
  ctx.beginPath();
  const markX = w * (0.42 + ((faceSeed >> 3) % 5) * 0.04);
  if (band % 2 === 0) {
    ctx.moveTo(markX, h * 0.30);
    ctx.lineTo(markX + w * 0.06, h * 0.36);
  } else {
    ctx.arc(w / 2, h * 0.18, w * 0.10, Math.PI * 0.15, Math.PI * 0.85);
  }
  ctx.stroke();

  // collars, so rank reads at a glance without a legend
  ctx.strokeStyle = `hsl(${hue}, 20%, 58%)`;
  ctx.lineWidth = Math.max(1, w * 0.008);
  ctx.beginPath();
  ctx.moveTo(w * 0.40, h * 0.86);
  ctx.lineTo(w * 0.5, h * 0.98);
  ctx.lineTo(w * 0.60, h * 0.86);
  ctx.stroke();
}

/**
 * The screen. Rendered as soon as it opens; `refresh()` redraws after a change so
 * the visitor can watch a slot go.
 */
export function createRegistry(
  host: HTMLElement,
  opts: {
    sector: SectorState;
    known: KnownSet;
    seed: number;
  } & RegistryOptions,
): RegistryHandle {
  const root = el(
    'div',
    `position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr) 300px;` +
      `background:${C.bg};color:${C.ink};font:${FONT_MONO};z-index:24`,
  );
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'The Registry');

  const main = el('div', 'padding:20px 22px;overflow:auto');
  const side = el(
    'div',
    `padding:20px 18px;overflow:auto;border-left:1px solid ${C.line};background:#0b0e11`,
  );
  root.append(main, side);
  host.append(root);

  const agents = new Map<string, MaterialisedAgent>();
  const agentFor = (h: Household): MaterialisedAgent => {
    let a = agents.get(h.id);
    if (!a) {
      a = materialise(opts.sector, h.id, opts.seed);
      agents.set(h.id, a);
    }
    return a;
  };

  function render(): void {
    main.replaceChildren();
    side.replaceChildren();

    const known = opts.known.all();
    const evicted = opts.known.evictions();

    main.append(
      el(
        'div',
        'display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-bottom:6px',
        el('div', `color:${C.gold};font-size:11px;letter-spacing:.18em`, 'THE REGISTRY'),
        el(
          'div',
          `color:${C.faint};font-size:9px`,
          `${known.length}/12 names · ${opts.sector.households.length} households · shift ${opts.sector.shift}`,
        ),
      ),
      el(
        'div',
        `color:${C.dim};font-size:10px;line-height:1.6;margin-bottom:16px;max-width:560px`,
        'A Warden can hold about a dozen people in their head. These are the ones who are in yours.',
      ),
    );

    if (known.length === 0) {
      main.append(
        el(
          'div',
          `color:${C.faint};font-size:10.5px;line-height:1.7;margin-bottom:12px`,
          'Nobody yet. A person joins this list when a record names them, or when you go and look at them twice.',
        ),
      );
    }

    for (const entry of known) {
      const household = opts.sector.households.find((h) => h.id === entry.household_id);
      if (!household) continue;
      const agent = agentFor(household);

      const row = el(
        'div',
        `display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;padding:10px 0;border-bottom:1px solid ${C.line}`,
      );
      const canvas = el('canvas', 'width:44px;height:52px;border:1px solid rgba(120,140,160,.25)');
      canvas.width = 44;
      canvas.height = 52;
      drawFace(canvas, agent.face_seed);

      const text = el('div', 'display:flex;flex-direction:column;gap:3px');
      text.append(
        el(
          'div',
          `font:${FONT_SERIF};font-size:14px;color:${C.ink}`,
          `${agent.name} — ${agent.papers.ration_class}`,
        ),
        el(
          'div',
          `font-size:9.5px;color:${C.dim};line-height:1.5`,
          describeHousehold(household),
        ),
        el(
          'div',
          `font-size:9px;color:${C.faint};line-height:1.5`,
          `known since shift ${entry.since} — ${entry.reason}`,
        ),
      );
      row.append(canvas, text);
      main.append(row);
    }

    /* -------------------------------------------------------- the unknown */
    const unknown = opts.sector.households.filter((h) => !opts.known.has(h.id));
    main.append(
      el(
        'div',
        `margin-top:22px;padding-top:14px;border-top:1px solid ${C.line};color:${C.gold};font-size:10px;letter-spacing:.14em`,
        `THE REST OF THE SECTOR (${unknown.length})`,
      ),
      el(
        'div',
        `color:${C.faint};font-size:9px;line-height:1.6;margin:6px 0 10px`,
        'Records, not people. You could learn any of these names. You cannot learn all of them.',
      ),
    );

    const grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:6px');
    for (const { household, heat } of heatRows(opts.sector, opts.known)) {
      const card = el(
        'div',
        `padding:6px 7px;border:1px solid ${C.line};border-radius:2px;cursor:pointer;` +
          `background:${heat > 60 ? 'rgba(201,112,95,.10)' : 'transparent'}`,
      );
      card.append(
        el('div', `font-size:8.5px;color:${C.dim}`, household.id),
        el(
          'div',
          `font-size:8.5px;color:${C.faint};line-height:1.4`,
          `${household.block.replace(/_/g, ' ')} · class ${household.ration_class}`,
        ),
      );
      const visit = button('Go and see', () => opts.onVisit?.(household.id), {
        style: `margin-top:5px;width:100%;padding:3px 0;font:${FONT_MONO};font-size:8px;color:${C.dim};background:transparent;border:1px solid ${C.line};border-radius:2px;cursor:pointer`,
      });
      card.append(visit);
      grid.append(card);
    }
    main.append(grid);

    /* ------------------------------------------------------ the forgotten */
    side.append(
      el('div', `color:${C.gold};font-size:10px;letter-spacing:.14em`, 'OUT OF YOUR HEAD'),
      el(
        'div',
        `color:${C.faint};font-size:9px;line-height:1.6;margin:6px 0 12px`,
        'Slots do not open. People are replaced.',
      ),
    );

    if (evicted.length === 0) {
      side.append(el('div', `color:${C.faint};font-size:9.5px`, 'Nobody. Yet.'));
    } else {
      for (const gone of [...evicted].reverse()) {
        const household = opts.sector.households.find((h) => h.id === gone.household_id);
        const agent = household ? agentFor(household) : null;
        const row = el('div', `padding:7px 0;border-bottom:1px solid ${C.line}`);
        row.append(
          el('div', `font-size:9.5px;color:${C.dim}`, agent ? agent.name : gone.household_id),
          el(
            'div',
            `font-size:8.5px;color:${C.faint};line-height:1.45`,
            `shift ${gone.shift} — ${gone.reason}`,
          ),
          el('div', `font-size:8.5px;color:${C.faint};margin-top:2px`, 'Still out there.'),
        );
        side.append(row);
      }
    }

    side.append(
      button('Close', () => close(), {
        style:
          `margin-top:18px;width:100%;padding:7px 0;font:${FONT_MONO};font-size:10px;` +
          `color:${C.ink};background:transparent;border:1px solid ${C.line};border-radius:3px;cursor:pointer`,
      }),
    );
  }

  /**
   * Closing removes the screen *and* tells the caller. A close button that only
   * fires a callback leaves the caller to unmount a thing it did not mount.
   */
  function close(): void {
    root.remove();
    opts.onClose?.();
  }

  render();
  return {
    destroy: () => root.remove(),
    refresh: render,
  };
}

/**
 * Households the player does not know, with a heat reading.
 *
 * Heat is a *claim-level* number — grievance and distance from loyalty — so it can be
 * shown honestly. Nothing here is a hidden fact.
 */
function heatRows(
  sector: SectorState,
  known: KnownSet,
): Array<{ household: Household; heat: number }> {
  return sector.households
    .filter((h) => !known.has(h.id))
    .map((household) => ({
      household,
      heat: Math.round((household.grievance * 0.6 + (1 - household.loyalty) * 0.4) * 100),
    }));
}

/** Meet someone: the only entry point into the Known set from the UI. */
export function meetHousehold(
  sector: SectorState,
  known: KnownSet,
  seed: number,
  householdId: string,
  reason: string,
  shift: number,
): { agent: MaterialisedAgent | null; evicted: string | null } {
  if (!sector.households.some((h) => h.id === householdId)) return { agent: null, evicted: null };
  const agent = materialise(sector, householdId, seed);
  const eviction = known.add({ household_id: householdId, reason }, shift);
  return { agent, evicted: eviction?.household_id ?? null };
}

/** Unused by the screen itself, kept for tests that want the palette. */
export const REGISTRY_COLOURS = C;
export const CELL_TONE = { gold: C.gold, red: C.red, green: C.green };
