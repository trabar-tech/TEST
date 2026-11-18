/**
 * Browser entry point and the shift loop.
 *
 * Owns everything allowed to touch the DOM or Pixi: boot, storage, input, the
 * render loop, and the error surface. The simulation knows none of it.
 *
 * The loop this file implements is Phase 1's whole deliverable:
 *
 *   briefing → beat (walk, inspect, decide) → desk (file, sign) → audit
 *            → debrief (what the city now believes) → next briefing
 */

import './ui/theme.css';
import contentJson from '../content/examples/content.sample.json';
import mapJson from '../content/maps/kiln_row_slice.json';
import citizensJson from '../content/examples/citizens.slice.json';
import barksJson from '../content/examples/barks.json';
import { ContentError, ContentVersion } from '@core/content';
import { TileMap, type Vec2 } from '@core/nav';
import { SaveError, createSaveService } from '@core/save';
import { createBrowserStorage } from './platform/storage';
import { loadBundle, mapJsonToDef } from '../scripts/lib/load-content';
import { Simulation, type CitizenFile, type MapJsonSlice } from '@systems/shift';
import { createScene, type SceneHandle } from '@render/scene';
import { createFallbackScene } from '@render/fallback';
import { createDebugOverlay } from '@ui/debug-overlay';
import { createHud } from '@ui/hud';
import { createInspectionPanel } from '@ui/inspection-panel';
import { createDesk } from '@ui/desk';
import { createDebrief } from '@ui/debrief';
import { createCaseFile } from '@ui/case-file';
import { Barks, type BarkSet } from '@systems/barks';
import { button, el } from '@ui/dom';

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
    const b = document.createElement('button');
    b.textContent = 'start a new campaign';
    b.onclick = retry;
    boot.appendChild(b);
  }
}

const BRIEFING = [
  'WARDEN RENNER. Sector 4, Kiln Row. Shift begins at 06:00.',
  '',
  'Quota: three inspections. A pass counts if you checked. Filing nothing counts as nothing.',
  'Anything you do not write up, the audit will write up for you, and it will not be kind.',
  '',
  'Click a citizen to inspect. Talk to them. Decide. Then file it at the desk.',
  'Whatever you sign becomes what the city knows.',
].join('\n');

async function start(): Promise<void> {
  /* -------------------------------------------------------- content first */
  let map: TileMap;
  let loaded: ReturnType<typeof loadBundle>;
  const sliceMap = mapJson as unknown as MapJsonSlice;
  try {
    loaded = loadBundle(contentJson, 'content.sample.json', ContentVersion);
    map = new TileMap(mapJsonToDef(mapJson));
    if (!Array.isArray(sliceMap.posts) || !Array.isArray(sliceMap.cameras)) {
      throw new Error('the slice map has no posts or cameras');
    }
  } catch (e) {
    if (e instanceof ContentError) {
      fail('CONTENT ERROR', `${e.file}: ${e.path} — ${e.message.replace(/^.*?— /, '')}`);
      return;
    }
    fail('CONTENT ERROR', (e as Error).message);
    return;
  }

  const { storage, kind, warning } = await createBrowserStorage();
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 20261118) || 20261118;

  const sim = new Simulation({
    seed,
    shift: 1,
    map,
    mapJson: sliceMap,
    citizens: citizensJson as unknown as CitizenFile,
    quotaInspections: Number(params.get('quota') ?? 3) || 3,
  });
  const saves = createSaveService(storage);
  sim.bus.emit('content:loaded', {
    version: loaded.version,
    storylets: loaded.bundle.micro_events.length,
    ratio: Number(loaded.report.connectiveTissueRatio.toFixed(2)),
  });
  sim.bus.emit('save:storage', { kind });

  /* --------------------------------------------------------------- render */
  let scene: SceneHandle;
  let backendWarning: string | null = null;
  try {
    scene = await createScene(sim, host);
  } catch (e) {
    console.warn('webgl unavailable, using canvas2d', e);
    scene = createFallbackScene(sim, host);
    backendWarning = 'WebGL unavailable — running the Canvas2D fallback renderer.';
  }

  const barks = new Barks(barksJson as unknown as BarkSet, seed, 1);
  const hud = createHud(sim, host);
  const overlay = createDebugOverlay(sim, host);
  const caseFile = createCaseFile(sim, host);
  overlay.setRenderer(scene.backend);
  if (backendWarning) overlay.flash(backendWarning, 'bad');
  else if (warning) overlay.flash(warning, 'bad');
  else if (kind === 'localstorage') overlay.flash('indexeddb unavailable — using localStorage');

  /* ------------------------------------------------------------------ ui */
  let panel: ReturnType<typeof createInspectionPanel> | null = null;
  let desk: ReturnType<typeof createDesk> | null = null;
  let debrief: ReturnType<typeof createDebrief> | null = null;
  let briefingEl: HTMLElement | null = null;

  function clearUi(): void {
    panel?.destroy();
    panel = null;
    desk?.destroy();
    desk = null;
    debrief?.destroy();
    debrief = null;
    briefingEl?.remove();
    briefingEl = null;
  }

  function showBriefing(): void {
    briefingEl?.remove();
    const box = el(
      'div',
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,6,8,.9);z-index:20',
    );
    const inner = el(
      'div',
      'width:min(560px,92vw);padding:22px 24px;border:1px solid rgba(120,140,160,.3);border-radius:3px;background:#0f1318',
    );
    inner.append(
      el('div', 'color:#6f7d8b;font:9.5px ui-monospace,monospace;letter-spacing:.2em', 'CIVIL PROTECTION · SECTOR 4 · 05:40'),
      el('pre', 'margin:14px 0 18px;font:12px/1.75 ui-monospace,monospace;color:#c9d3dd;white-space:pre-wrap', BRIEFING),
      button('Begin the shift', () => {
        box.remove();
        briefingEl = null;
        sim.beginBeat();
        hud.announce(`SHIFT 1 · ${sim.quotaInspections} INSPECTIONS`, 4200);
        hud.radio(barks.radio());
      }, {
        style:
          'padding:8px 15px;font:11px ui-monospace,monospace;letter-spacing:.08em;color:#0d1013;background:#d8b06a;border:1px solid #d8b06a;border-radius:3px;cursor:pointer;font-weight:600',
      }),
    );
    box.append(inner);
    host.append(box);
    briefingEl = box;
  }

  function openInspectionFor(id: string): void {
    if (sim.phase !== 'beat' || panel) return;
    const insp = sim.openInspection(id);
    if (!insp) return;
    panel = createInspectionPanel(sim, host, () => {
      panel?.destroy();
      panel = null;
      if (sim.inspection) sim.closeInspection();
    });
    hud.setHover(null);
  }

  function openDesk(): void {
    if (desk) return;
    panel?.destroy();
    panel = null;
    sim.openDesk();
    desk = createDesk(sim, host, { onSubmit: submitDocket });
  }

  function submitDocket(): void {
    const result = sim.submit();
    desk?.destroy();
    desk = null;
    debrief = createDebrief(sim, host, { onRestart: nextShift });
    debrief.render(result);
  }

  /**
   * Next shift. Phase 1 has one shift's worth of content, so this resets the
   * scene and carries the *belief* forward — which is the only thing that has to
   * be true for the loop to be real.
   */
  function nextShift(): void {
    clearUi();
    debrief?.destroy();
    debrief = null;
    const beliefBefore = sim.belief();
    sim.record.age();
    sim.docket.length = 0;
    sim.inspectionsDone = 0;
    sim.state.shift += 1;
    sim.phase = 'brief';
    sim.clock.restore({ tick: 0, simSeconds: 0, mode: 'pause' });
    sim.emit('shift:next', {
      shift: sim.state.shift,
      resistance: beliefBefore.resistance_estimate,
      review: sim.lastAudit?.review ?? false,
    });
    // rebuild the street at its posts; the record survives, the people reset
    sim.resetBeat();
    showBriefing();
    hud.announce(`SHIFT ${sim.state.shift}`, 3000);
  }

  /* --------------------------------------------------------------- input */
  let cursor: Vec2 | null = null;
  let cursorValid = true;

  host.addEventListener('pointermove', (e) => {
    if (sim.phase !== 'beat' || panel) return;
    cursor = scene.toWorld(e.clientX, e.clientY);
    const tile = map.toTile(cursor);
    cursorValid = map.isWalkable(tile.tx, tile.ty);
    const near = sim.citizens.nearest(cursor, 34);
    sim.hoveredCitizenId = near?.id ?? null;
    hud.setHover(near ?? null);
    if (near) hud.setPrompt(near.temperament === 'afraid' ? 'click to inspect' : 'click to inspect');
    else hud.setPrompt(null);
  });

  host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || sim.phase !== 'beat' || panel) return;
    const target = scene.toWorld(e.clientX, e.clientY);
    const near = sim.citizens.nearest(target, 34);
    if (near) {
      openInspectionFor(near.id);
      return;
    }
    const result = sim.moveTo(target);
    if (!result.ok) overlay.flash(result.reason, 'bad');
  });

  host.addEventListener('pointerleave', () => {
    cursor = null;
    sim.hoveredCitizenId = null;
    hud.setHover(null);
  });

  window.addEventListener('keydown', (e) => {
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
    if (e.key === 'c' || e.key === 'C') {
      if (caseFile.isOpen()) caseFile.close();
      else caseFile.open();
      return;
    }
    if (e.key === 'Tab' && sim.phase === 'beat' && sim.inspectionsDone > 0 && !desk) {
      // no. Tab belongs to the form. The desk opens when the beat ends, or on E.
      return;
    }
    if ((e.key === 'e' || e.key === 'E') && sim.phase === 'beat') {
      openDesk();
    }
  });

  /* ---------------------------------------------------------------- loop */
  let last = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let overlayAccum = 0;

  function frame(): void {
    const now = performance.now();
    const dt = now - last;
    last = now;

    sim.frame();
    scene.draw(sim, { cursor, cursorValid });

    if (sim.phase === 'desk' && !desk) openDesk();

    // ambience: a loudspeaker line or a stage direction, never both at once
    const bark = barks.next(sim.clock.simSeconds);
    if (bark && sim.phase === 'beat') {
      if (bark.kind === 'loudspeaker') hud.radio(bark.text, 'speaker');
      else hud.ambient(bark.text);
    }

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
      hud.tick();
      overlayAccum = 0;
    }
    requestAnimationFrame(frame);
  }

  function onResize(): void {
    scene.resize(host.clientWidth, host.clientHeight);
    sim.bus.emit('render:resize', { w: host.clientWidth, h: host.clientHeight });
  }
  window.addEventListener('resize', onResize);
  onResize();

  boot.style.opacity = '0';
  window.setTimeout(() => boot.remove(), 260);

  sim.clock.start();
  requestAnimationFrame(frame);
  showBriefing();
  overlay.flash('briefing · click Begin the shift');

  if (import.meta.env.DEV) {
    Object.assign(window as unknown as Record<string, unknown>, { sim, saves, scene });
  }
  sim.bus.emit('save:ready', { kind, hasSave: await saves.has() });
}

start().catch((e) => {
  if (e instanceof SaveError) fail('SAVE ERROR', e.message);
  else fail('BOOT FAILURE', (e as Error)?.message ?? String(e));
  console.error(e);
});
