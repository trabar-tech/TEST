/**
 * Browser entry point.
 *
 * Owns everything that is allowed to touch the DOM or Pixi: boot, storage,
 * input, the render loop, and the error surface. The simulation knows nothing
 * about any of it (ADR-0001).
 *
 * Failure policy: a content or save error must produce a readable screen with a
 * way forward, never a white page (P0-T04 / P0-T07 acceptance).
 */

import './ui/theme.css';
import contentJson from '../content/examples/content.sample.json';
import mapJson from '../content/maps/kiln_row_block_a.json';
import { ContentError, ContentVersion } from '@core/content';
import { TileMap, type Vec2 } from '@core/nav';
import { SaveError, createSaveService } from '@core/save';
import { createBrowserStorage } from './platform/storage';
import { loadBundle, mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Sim } from '@systems/sim';
import { createScene } from '@render/scene';
import { createDebugOverlay } from '@ui/debug-overlay';

const boot = document.getElementById('boot')!;
const host = document.getElementById('app')!;

function fail(title: string, detail: string, retry?: () => void): void {
  boot.style.gap = '14px';
  boot.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const err = document.createElement('span');
  err.className = 'err';
  err.textContent = detail;
  boot.append(strong, err);
  if (retry) {
    const button = document.createElement('button');
    button.textContent = 'start a new campaign';
    button.onclick = retry;
    boot.appendChild(button);
  }
}

async function start(): Promise<void> {
  /* -------------------------------------------------------- content first */
  let map: TileMap;
  let loaded: ReturnType<typeof loadBundle>;
  try {
    loaded = loadBundle(contentJson, 'content.sample.json', ContentVersion);
    map = new TileMap(mapJsonToDef(mapJson as MapJson));
  } catch (e) {
    if (e instanceof ContentError) {
      fail('CONTENT ERROR', `${e.file}: ${e.path} — ${e.message.replace(/^.*?— /, '')}`);
      return;
    }
    fail('CONTENT ERROR', (e as Error).message);
    return;
  }

  /* -------------------------------------------------------------- storage */
  const { storage, kind, warning } = await createBrowserStorage();

  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 20261118) || 20261118;

  const sim = new Sim({ seed, map, shift: 1 });
  const saves = createSaveService(storage);
  sim.bus.emit('content:loaded', {
    version: loaded.version,
    storylets: loaded.bundle.micro_events.length,
    ratio: Number(loaded.report.connectiveTissueRatio.toFixed(2)),
  });
  sim.bus.emit('save:storage', { kind });

  const scene = await createScene(sim, host);
  const overlay = createDebugOverlay(sim, host);
  sim.bus.emit('sim:boot', { mode: 'debug', saving: kind });

  /* ---------------------------------------------------------------- input */
  let cursor: Vec2 | null = null;
  let cursorValid = true;

  function toWorld(clientX: number, clientY: number): Vec2 {
    // the scene fits the map with a uniform scale and centres it; invert that
    const canvas = host.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const { map: m } = sim;
    const worldW = m.width * m.tileSize;
    const worldH = m.height * m.tileSize;
    const scale = Math.max(
      0.35,
      Math.min(rect.width / worldW, rect.height / worldH) * 0.94,
    );
    const ox = (rect.width - worldW * scale) / 2;
    const oy = (rect.height - worldH * scale) / 2;
    return {
      x: (clientX - rect.left - ox) / scale,
      y: (clientY - rect.top - oy) / scale,
    };
  }

  host.addEventListener('pointermove', (e) => {
    cursor = toWorld(e.clientX, e.clientY);
    const tile = map.toTile(cursor);
    cursorValid = map.isWalkable(tile.tx, tile.ty);
  });

  host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = toWorld(e.clientX, e.clientY);
    const result = sim.moveTo(target);
    overlay.flash(result.ok ? `route · ${result.waypoints} waypoints` : result.reason, result.ok ? 'ok' : 'bad');
    drawScene();
  });

  host.addEventListener('pointerleave', () => {
    cursor = null;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5') return; // let the browser reload
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void saves.save(sim.snapshot()).then(() => overlay.flash('saved'));
      return;
    }
    if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void saves.load().then((state) => {
        if (!state) {
          overlay.flash('no save found', 'bad');
          return;
        }
        sim.restore(state);
        overlay.flash(`loaded · tick ${state.tick.tick}`);
      });
      return;
    }
    if (e.key === 'r') {
      sim.restore({ ...sim.snapshot(), tick: { tick: 0, simSeconds: 0, mode: 'patrol' } });
      overlay.flash('clock reset');
    }
  });

  /* ----------------------------------------------------------------- loop */
  let last = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let overlayAccum = 0;

  function drawScene(): void {
    scene.draw(sim, { cursor, cursorValid });
  }

  function frame(): void {
    const now = performance.now();
    const dt = now - last;
    last = now;

    sim.frame();
    drawScene();

    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 500) {
      overlay.setFps((fpsFrames * 1000) / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }
    overlayAccum += dt;
    if (overlayAccum >= 100) {
      overlay.tick();
      overlayAccum = 0;
    }

    requestAnimationFrame(frame);
  }

  function onResize(): void {
    const canvas = host.querySelector('canvas');
    if (!canvas) return;
    void canvas;
    scene.resize(host.clientWidth, host.clientHeight);
    drawScene();
  }
  window.addEventListener('resize', onResize);
  onResize();

  boot.style.opacity = '0';
  window.setTimeout(() => boot.remove(), 260);

  sim.clock.start();
  requestAnimationFrame(frame);

  if (warning) overlay.flash(warning, 'bad');
  else if (kind === 'localstorage') overlay.flash('indexeddb unavailable — using localStorage');

  // dev-only handle for poking at the sim from the console
  if (import.meta.env.DEV) {
    (window as unknown as { sim: Sim; saves: typeof saves }).sim = sim;
    (window as unknown as { sim: Sim; saves: typeof saves }).saves = saves;
  }
  sim.bus.emit('save:ready', { kind, hasSave: await saves.has() });
}

start().catch((e) => {
  if (e instanceof SaveError) fail('SAVE ERROR', e.message);
  else fail('BOOT FAILURE', (e as Error)?.message ?? String(e));
  console.error(e);
});
