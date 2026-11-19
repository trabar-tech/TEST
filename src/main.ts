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
import interiorJson from '../content/maps/interior_flat14.json';
import anchorsJson from '../content/maps/incident_anchors.json';
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
import { Incident } from '@systems/tactical/incident';
import { createIncidentView } from '@ui/incident-view';
import { ORDER_HOTKEYS, type OrderKind } from '@systems/tactical/types';
import { stepCrowd, type CrowdDef } from '@systems/tactical/crowd';
import { crowdDocket } from '@systems/tactical/paperwork';
import type { InteriorMapJson } from '@systems/tactical/types';
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

  /* ------------------------------------------------------------ tactical */
  // the flat, loaded once: Phase 2 has one interior and says so out loud
  const interior = interiorJson as unknown as InteriorMapJson;
  const interiorMap = new TileMap(mapJsonToDef(interior as unknown as Parameters<typeof mapJsonToDef>[0]));
  const anchors = (anchorsJson as unknown as { anchors: Array<Record<string, unknown>> }).anchors;
  const flat14 = anchors.find((a) => a.id === 'flat14') as { address: string; brief: string; interior: string } | undefined;

  let incident: Incident | null = null;
  let incidentView: ReturnType<typeof createIncidentView> | null = null;
  let crowd: CrowdDef | null = null;
  let forceIndex = { sector: 'kiln_row', value: 0 };

  /* ------------------------------------------------------------------ ui */
  // declared here, before anything can call into them: `showAnchors` is invoked
  // from the briefing button and from the desk, and a TDZ error at the first
  // click would be an ugly way to ship a phase
  let anchorEl: HTMLElement | null = null;
  let panel: ReturnType<typeof createInspectionPanel> | null = null;
  let desk: ReturnType<typeof createDesk> | null = null;
  let debrief: ReturnType<typeof createDebrief> | null = null;
  let briefingEl: HTMLElement | null = null;

  function clearUi(): void {
    panel?.destroy();
    panel = null;
    incidentView?.destroy();
    incidentView = null;
    incident = null;
    anchorEl?.remove();
    anchorEl = null;
    crowdEl?.remove();
    crowdEl = null;
    crowd = null;
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
        showAnchors();
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

  /* ------------------------------------------------------------- incident */

  /**
   * Enter the flat. This is the Phase 2 loop's hinge: the street generates an
   * incident, the incident generates facts, and the facts become one card on the
   * same docket the inspections use.
   */
  function openIncident(which: 'flat14' | 'canal_market'): void {
    if (incident || desk || sim.phase !== 'beat') return;
    panel?.destroy();
    panel = null;
    sim.setMode('plan');
    anchorEl?.remove();
    anchorEl = null;

    if (which === 'canal_market') {
      const a = anchors.find((x) => x.id === 'canal_market') as { address: string; crowd: CrowdDef; brief: string } | undefined;
      if (!a) return;
      crowd = { ...a.crowd };
      hud.announce('CANAL MARKET · CROWD', 3000);
      hud.radio('Overwatch: Two hundred at the corner. No permit. One organiser on the list.');
      showCrowd(a.address);
      return;
    }

    const address = flat14?.address ?? 'Block C, flat fourteen';
    incident = new Incident({
      seed,
      shift: sim.state.shift,
      map: interiorMap,
      json: interior,
      forceIndex,
      officers: [
        { id: 'o-01', name: 'Renner', traits: ['disciplined'] },
        { id: 'o-02', name: 'Ferro', traits: ['jumpy'] },
      ],
      officerSpawns: {
        'o-01': { x: 8 * interiorMap.tileSize + 16, y: 18 * interiorMap.tileSize + 16 },
        'o-02': { x: 9 * interiorMap.tileSize + 16, y: 19 * interiorMap.tileSize + 16 },
      },
    });

    hud.announce('INCIDENT · BLOCK C', 2600);
    hud.radio(`Overwatch: ${flat14?.brief ?? 'Stair door is barred. Your call.'}`);

    const view = createIncidentView(incident, host, {
      onEnter: (room, method) => {
        if (!incident) return;
        const officers = incident.squad?.size ?? 1;
        const res = incident.enterRoom(room, method, officers);
        if (!res.ok) {
          hud.announce(res.reason ?? 'That will not work.', 2400);
          return;
        }
        incidentView?.render();
      },
      onClear: (room) => {
        if (!incident) return;
        const claim = incident.clearRoom(room);
        hud.announce(claim.claimed ? `Room reported clear.` : 'Not clear.', 2200);
        incidentView?.render();
      },
      onOrder: (kind: OrderKind) => {
        if (!incident) return;
        incident.issue({ kind });
        incidentView?.render();
      },
      onForce: (target, rung) => {
        if (!incident) return;
        const inc = incident;
        const res = inc.applyForceTo(target, rung);
        if (res.reason) hud.announce(res.reason, 2000);
        if (inc.unauthorisedForce && rung >= 4) {
          hud.announce('RUNG 4 WITHOUT AUTHORISATION · compliance review', 3200);
        }
        incidentView?.render();
      },
      onDetain: (target) => {
        if (!incident) return;
        if (!incident.detain(target)) hud.announce('They are not compliant enough to cuff.', 2200);
        incidentView?.render();
      },
      onAuthorise: (rung) => {
        const inc = incident;
        if (!inc) return;
        inc.requestAuthority(rung);
        hud.radio('Overwatch: Authorisation noted. Rung four is yours.');
        incidentView?.render();
      },
      onStabilise: (target) => {
        const inc = incident;
        if (!inc) return;
        inc.stabilise(target);
        incidentView?.render();
      },
      onEnd: () => closeIncident(),
    }, { address });
    incidentView = view;
  }

  /** The crowd: one loop, one number, one decision per press. */
  function showCrowd(address: string): void {
    if (!crowd) return;
    const box = el(
      'div',
      'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(4,6,8,.94);z-index:18;font:12px ui-monospace,monospace;color:#c9d3dd',
    );
    const ring = el('div', 'width:180px;height:6px;background:#1a2026;border-radius:3px;overflow:hidden');
    const fill = el('div', 'height:100%;background:#c9705f;transition:width .4s');
    ring.append(fill);
    const readout = el('div', 'font-size:11px;color:#7f8d9b;text-align:center;max-width:52ch;line-height:1.6');
    const state = el('div', 'font-size:13px;letter-spacing:.2em;color:#d8b06a');

    const draw = () => {
      if (!crowd) return;
      fill.style.width = `${Math.round(crowd.heat * 100)}%`;
      state.textContent = `${crowd.state.toUpperCase()} · ${crowd.agents} PEOPLE`;
      readout.textContent = `${address}. Grievance: ${crowd.grievance.replace(/_/g, ' ')}.`;
    };

    const act = (kind: Parameters<typeof stepCrowd>[1]['kind'], label: string) => () => {
      if (!crowd) return;
      const out = stepCrowd(crowd, { kind, seconds: 2 });
      crowd = out.crowd;
      if (out.note) hud.ambient(out.note);
      draw();
      if (crowd.heat >= 0.98 && crowd.state === 'riot') {
        hud.announce('RIOT · the street is lost for tonight', 4000);
      }
    };

    const actions = el('div', 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:520px');
    for (const [kind, label] of [
      ['presence', 'Hold the line'],
      ['single_voice', 'One voice'],
      ['loudhailer', 'Loudhailer'],
      ['arrest_leader', 'Arrest the organiser'],
      ['baton_charge', 'Baton charge'],
      ['gas', 'Gas'],
      ['withdraw', 'Withdraw'],
    ] as const) {
      actions.append(
        button(label, act(kind, label), {
          style:
            'padding:5px 9px;font:9.5px ui-monospace,monospace;letter-spacing:.06em;color:#c9d3dd;background:#151a1f;border:1px solid rgba(120,140,160,.3);border-radius:2px;cursor:pointer',
        }),
      );
    }
    actions.append(
      button('Leave the street', () => {
        const c = crowd;
        box.remove();
        crowd = null;
        crowdEl = null;
        sim.setMode('patrol');
        // the street becomes a line, like everything else
        sim.addCrowd(
          crowdDocket({
            ref: `crw-${sim.state.shift}-${sim.docket.length + 1}`,
            address,
            crowd: c ?? {
              id: 'crowd:canal_market',
              label: 'canal market',
              agents: 34,
              heat: 0.24,
              leaders: [],
              grievance: 'ration_cut',
              state: 'milling',
            },
            arrests: c && c.state === 'riot' ? 2 : 0,
            peakState: c?.state ?? 'milling',
            legitimacy: 0,
          }),
        );
        hud.announce('STREET CLOSED · ONE LINE TO FILE', 3000);
        openDesk();
      }, {
        style:
          'padding:5px 9px;font:9.5px ui-monospace,monospace;letter-spacing:.06em;color:#0d1013;background:#d8b06a;border:1px solid #d8b06a;border-radius:2px;cursor:pointer;font-weight:600',
      }),
    );

    box.append(state, ring, readout, actions);
    host.append(box);
    incidentView = null;
    crowdEl = box;
    draw();
  }

  let crowdEl: HTMLElement | null = null;

  /**
   * The street's two incident anchors, as clickable marks on the paving. No icon
   * art: a dashed square and a word, because the preview allows no assets.
   */
  function showAnchors(): void {
    anchorEl?.remove();
    if (sim.phase !== 'beat') return;
    const wrap = el('div', 'position:absolute;inset:0;pointer-events:none;z-index:6');
    const list: Array<{ id: 'flat14' | 'canal_market'; x: number; y: number; text: string }> = [
      { id: 'flat14', x: 12, y: 8, text: 'BLOCK C · FLAT 14' },
      { id: 'canal_market', x: 30, y: 20, text: 'CANAL MARKET' },
    ];
    for (const a of list) {
      const w = map.toWorld(a.x, a.y);
      const p = scene.toScreen(w.x, w.y);
      const b = el(
        'div',
        `position:absolute;left:${p.x - 44}px;top:${p.y - 12}px;width:88px;padding:3px 4px;border:1px dashed rgba(216,176,106,.6);background:rgba(9,12,15,.72);color:#d8b06a;font:8.5px ui-monospace,monospace;letter-spacing:.1em;text-align:center;cursor:pointer;pointer-events:auto`,
        a.text,
      );
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        openIncident(a.id);
      });
      wrap.append(b);
    }
    host.append(wrap);
    anchorEl = wrap;
  }

  /** End the incident: the facts become one docket card, as honest as it gets. */
  function closeIncident(): void {
    if (!incident) return;
    const result = incident.result();
    const address = flat14?.address ?? 'Block C, flat fourteen';
    sim.incidentResult = result;
    sim.addIncident(result, {
      ref: `int-${sim.state.shift}-${sim.docket.length + 1}`,
      address,
      cameras: interior.cameras?.map((c) => c.id) ?? [],
      witnesses: [],
    });

    // the ratchet: this scene changes what the sector is like next shift
    forceIndex = { sector: forceIndex.sector, value: forceIndex.value + result.forceUsed.reduce((a, f) => a + (f.rung === 5 ? 9 : f.rung === 4 ? 6 : f.rung === 3 ? 2.5 : 1), 0) };

    incidentView?.destroy();
    incidentView = null;
    incident = null;
    sim.setMode('patrol');
    hud.announce('INCIDENT CLOSED · ONE LINE TO FILE', 3000);
    hud.radio('Overwatch: I have the log. The desk will want it in your words.');
    openDesk();
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
  let focusHeld = false;

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

  host.addEventListener('pointerup', (e) => {
    if (e.button === 2) focusHeld = false;
  });

  host.addEventListener('contextmenu', (e) => {
    if (incident && !incident.hasSquad) e.preventDefault();
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

  host.addEventListener('pointerdown', (e) => {
    // right mouse button held = Focus, solo only (SYS-TACT-01 §1)
    if (e.button === 2 && incident && !incident.hasSquad) {
      focusHeld = true;
      e.preventDefault();
    }
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
    if ((e.key === 'f' || e.key === 'F') && sim.phase === 'beat' && !incident && !desk) {
      openIncident('flat14');
    }
    // order hotkeys own 1–8 while a scene is open: the clock is the scene's, not
    // the street's, so there is no ambiguity about what a digit means
    if (incident && !e.ctrlKey && !e.metaKey) {
      const kind = ORDER_HOTKEYS[e.key];
      if (kind) {
        e.preventDefault();
        incident.issue({ kind });
        incidentView?.render();
        return;
      }
    }
    if (e.key === 'Escape' && incident) {
      closeIncident();
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
    if (incident) {
      incident.setFocus(focusHeld, Math.min(0.05, dt / 1000));
      incident.step(Math.min(0.05, dt / 1000));
      if (incident.tick % 6 === 0) incidentView?.render();
    }
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
