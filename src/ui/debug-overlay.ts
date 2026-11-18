/**
 * Debug overlay (P0-T03).
 *
 * A DOM panel, not a Pixi one: text in DOM is crisp at any DPI, selectable, and
 * costs nothing to rebuild. It is also the project's main diagnostic surface —
 * ADR-0004 requires every director decision to be inspectable, and this is where
 * that starts.
 *
 * Inline styles only. The preview runs in a sandboxed iframe with no network, so
 * there are no external fonts or stylesheets anywhere in this app.
 */

import type { EventBus, LoggedEvent } from '@core/bus';
import type { Sim } from '@systems/sim';
import type { TimeMode } from '@core/clock';

const SANS = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const MODE_KEYS: Array<{ key: string; mode: TimeMode; label: string }> = [
  { key: '1', mode: 'patrol', label: 'PATROL 1.0×' },
  { key: '2', mode: 'focus', label: 'FOCUS 0.35×' },
  { key: '3', mode: 'plan', label: 'PLAN 0.15×' },
  { key: '4', mode: 'pause', label: 'PAUSE' },
];

export interface OverlayHandle {
  tick(): void;
  setFps(fps: number): void;
  /** which renderer is live, so a silent fallback is visible */
  setRenderer(name: string): void;
  flash(message: string, kind?: 'ok' | 'bad'): void;
  destroy(): void;
}

export function createDebugOverlay(sim: Sim, host: HTMLElement): OverlayHandle {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:absolute',
    'inset:0',
    'pointer-events:none',
    `font:11px/1.45 ${SANS}`,
    'color:#c9d3dd',
    'text-shadow:0 1px 2px #000',
    'user-select:none',
  ].join(';');

  /* ------------------------------------------------------------- top-left */
  const stats = document.createElement('div');
  stats.style.cssText = [
    'position:absolute',
    'top:10px',
    'left:10px',
    'padding:8px 10px',
    'background:rgba(9,12,15,.82)',
    'border:1px solid rgba(120,140,160,.22)',
    'border-radius:3px',
    'white-space:pre',
    'min-width:186px',
  ].join(';');

  /* ------------------------------------------------------- bottom-left log */
  const logWrap = document.createElement('div');
  logWrap.style.cssText = [
    'position:absolute',
    'left:10px',
    'bottom:10px',
    'width:min(420px, 46vw)',
    'padding:7px 9px',
    'background:rgba(9,12,15,.82)',
    'border:1px solid rgba(120,140,160,.22)',
    'border-radius:3px',
  ].join(';');

  const logHead = document.createElement('div');
  logHead.style.cssText = 'display:flex;gap:8px;align-items:baseline;margin-bottom:4px';
  const logTitle = document.createElement('span');
  logTitle.textContent = 'debug:bus';
  logTitle.style.cssText = 'color:#7f8d9b;letter-spacing:.08em';
  const filters = document.createElement('span');
  filters.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';

  const filterState = new Set<string>(); // empty = show all
  const chips = new Map<string, HTMLButtonElement>();
  for (const type of ['nav', 'clock', 'sim', 'save', 'content']) {
    const chip = document.createElement('button');
    chip.textContent = type;
    chip.style.cssText = [
      'pointer-events:auto',
      'font:inherit',
      'cursor:pointer',
      'padding:0 5px',
      'border-radius:2px',
      'border:1px solid rgba(120,140,160,.35)',
      'background:transparent',
      'color:#8a97a5',
    ].join(';');
    chip.onclick = () => {
      if (filterState.has(type)) filterState.delete(type);
      else filterState.add(type);
      paintChip(chip, filterState.has(type));
      render();
    };
    chips.set(type, chip);
    filters.appendChild(chip);
  }
  function paintChip(chip: HTMLButtonElement, active: boolean): void {
    chip.style.background = active ? 'rgba(216,168,90,.25)' : 'transparent';
    chip.style.color = active ? '#e5c892' : '#8a97a5';
    chip.style.borderColor = active ? 'rgba(216,168,90,.6)' : 'rgba(120,140,160,.35)';
  }
  const logBody = document.createElement('div');
  logBody.style.cssText =
    'height:104px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end';
  logWrap.append(logHead, logBody);
  logHead.append(logTitle, filters);

  /* ------------------------------------------------------------- toasts */
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:absolute',
    'top:10px',
    'left:50%',
    'transform:translateX(-50%)',
    'padding:6px 12px',
    'border-radius:3px',
    'background:rgba(9,12,15,.9)',
    'border:1px solid rgba(120,140,160,.3)',
    'opacity:0',
    'transition:opacity .18s ease',
    'white-space:nowrap',
  ].join(';');

  root.append(stats, logWrap, toast);
  host.appendChild(root);

  /* ------------------------------------------------------------ behaviour */

  let visible = true;
  let fps = 0;
  /** set by main.ts once the renderer is known */
  let renderer = '?';
  let toastTimer: number | undefined;

  function render(): void {
    const tail = sim.bus.tail(120);
    const shown = filterState.size === 0
      ? tail
      : tail.filter((e) => filterState.has(e.meta.type.split(':')[0] ?? ''));
    const last = shown.slice(-7);
    logBody.textContent = '';
    for (const e of last) logBody.appendChild(line(e));
  }

  function line(e: LoggedEvent): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;white-space:nowrap;overflow:hidden';
    const t = document.createElement('span');
    t.textContent = `t${String(e.meta.tick).padStart(5, '0')}`;
    t.style.cssText = 'color:#5d6a77;flex:none';
    const type = document.createElement('span');
    type.textContent = e.meta.type;
    type.style.cssText = `flex:none;width:84px;color:${colorFor(e.meta.type)}`;
    const payload = document.createElement('span');
    payload.textContent = summarise(e.payload);
    payload.style.cssText = 'color:#93a1af;overflow:hidden;text-overflow:ellipsis';
    row.append(t, type, payload);
    return row;
  }

  const unsub = sim.bus.on('*', () => {
    if (visible) render();
  });

  function tick(): void {
    if (!visible) return;
    const clock = sim.clock;
    const mode = clock.pendingMode === clock.mode
      ? clock.mode.toUpperCase()
      : `${clock.mode.toUpperCase()} → ${clock.pendingMode.toUpperCase()}`;
    stats.textContent = [
      `tick      ${String(clock.tick).padStart(6, '0')}`,
      `sim time  ${formatSeconds(clock.simSeconds)}`,
      `mode      ${mode}`,
      `timescale ${clock.timescale.toFixed(2)}×`,
      `fps       ${fps.toFixed(0)} (${sim.lastSteps} step${sim.lastSteps === 1 ? '' : 's'}/frame)`,
      `seed      ${sim.state.seed}  shift ${sim.state.shift}`,
      `renderer  ${renderer}`,
      `orders    ${sim.isMoving ? `${sim.remainingWaypoints} wp left` : 'idle'}`,
    ].join('\n');
  }

  function flash(message: string, kind: 'ok' | 'bad' = 'ok'): void {
    toast.textContent = message;
    toast.style.color = kind === 'bad' ? '#e2a19a' : '#cfe3c8';
    toast.style.borderColor = kind === 'bad' ? 'rgba(226,161,154,.5)' : 'rgba(160,200,150,.4)';
    toast.style.opacity = '1';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.style.opacity = '0';
    }, 1600);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.code === 'Backquote' || e.key === '`') {
      visible = !visible;
      root.style.display = visible ? 'block' : 'none';
      return;
    }
    if (!visible) return;
    const hit = MODE_KEYS.find((k) => k.key === e.key);
    if (hit) {
      sim.setMode(hit.mode);
      flash(`timescale → ${hit.label}`);
    }
  }
  window.addEventListener('keydown', onKey);

  render();
  tick();

  return {
    tick,
    setFps(v) {
      fps = v;
    },
    setRenderer(name) {
      renderer = name;
    },
    flash,
    destroy() {
      unsub();
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}

/* ------------------------------------------------------------------ helpers */

function formatSeconds(s: number): string {
  const total = Math.floor(s);
  const mm = String(Math.floor(total / 60) % 100).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function colorFor(type: string): string {
  if (type.startsWith('nav')) return '#8fb8cf';
  if (type.startsWith('clock')) return '#d8b06a';
  if (type.startsWith('save')) return '#a9c79a';
  if (type.startsWith('content')) return '#c9a3cf';
  return '#93a1af';
}

function summarise(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return String(payload);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof v === 'object' && v !== null) continue; // keep it one line
    parts.push(`${k}=${String(v)}`);
  }
  return parts.join(' ');
}
