---
id: TECH-01
title: Technical Design — Web-First Architecture
status: review
owner: tech
depends_on: [SYS-INDEX, ADR-0001]
consumed_by: [phase-0, src/*]
updated: 2026-11-18
---

# TECH-01 · Technical Design

**Constraints (locked):** single-player · PC · browser-first · keyboard + mouse · no server
required to play (static hosting) · must run at 60 fps on integrated graphics.

---

## 1. Stack

| Choice | Version | Why |
|---|---|---|
| **TypeScript** | 5.x, `strict` | the Record schema is the game; types are the cheapest correctness |
| **Vite** | 5.x | instant HMR, static build, no server needed |
| **Rendering: PixiJS** | 8.x (WebGL2, WebGPU opt-in) | 2D sprite batching is exactly the workload; avoids a 3D engine's weight |
| **Audio: WebAudio** via Howler | latest | ducking, positional pings, no asset pipeline pain |
| **State/UI: vanilla DOM + a tiny reactive store** | — | the Desk is a *form*; DOM gives accessibility, text selection, typed input, and IME for free. A canvas UI would fight all of it |
| **Persistence: IndexedDB** (idb) | latest | campaign saves + the Case File (a few MB) |
| **Tests: Vitest** | latest | sim/record determinism tests |
| **Lint: ESLint** + custom rule | — | **ban `Math.random` outside the seeded RNG** (determinism) |
| **Hosting: static** | any | no backend in v1.0. Cloud save = optional later |

**Explicit non-choices:** no Unity/Godot WASM export (payload + tooling friction), no 3D engine,
no React (for the in-game UI — too much churn for a form), no Electron (it's a web game), no
backend.

---

## 2. Why this shape (and the two real alternatives)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Pixi + DOM UI** (chosen) | small payload, fast 2D, native text input & a11y, static hosting | two rendering worlds to style | ✅ |
| Phaser | batteries included, big community | scene/asset opinions fight a data-driven sim; DOM overlays still needed | rejected |
| Godot 4 → web | real editor, tilemaps | 30–60 MB payload, `SharedArrayBuffer`/COOP-COEP headaches, worse mobile/iGPU perf | rejected (revisit only if the project becomes desktop-first) |
| Unity → web | mature | heaviest payload of all; web is a second-class target | rejected |

**The payload constraint drives everything**: the whole initial download must be **< 250 MB**,
ideally **< 40 MB** (art + audio). That means a *small persistent world* (one sector), a
*limited agent count*, and *data-driven content* — which is exactly the design the GDD wants.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         UI (DOM)                            │
│  Desk form · Docket · Case File · HUD · menus · radio log   │
└───────────────▲─────────────────────────────┬───────────────┘
                │ view-model (read-only)      │ commands (intents)
┌───────────────┴─────────────────────────────▼───────────────┐
│                      CORE (pure TS)                         │
│                                                             │
│  Clock ──▶ World (ECS-lite) ──▶ Systems (fixed order)       │
│                                                             │
│  Systems: patrol · inspection · tactical · crowd ·          │
│           record · audit · sector · directors · economy     │
│                                                             │
│  EventBus (single choke point, fully logged)                │
└───────────────▲─────────────────────────────┬───────────────┘
                │ snapshot                    │ render cmds
┌───────────────┴─────────────────────────────▼───────────────┐
│                    RENDER (PixiJS)                          │
│  tilemap · sprites · lights · fog/silhouettes · overlays    │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Hard rules (these are the ones that make later phases cheap)

1. **Core is pure and headless.** No Pixi, no DOM, no `window`. It must be runnable in Vitest and
   from the OVERSEER dispatch resolver. *This one rule buys the entire expansion.*
2. **All mutation flows through systems in a fixed order**, driven by the clock. No ad-hoc
   mutation from UI handlers — UI emits intents.
3. **One EventBus.** Every message is typed and appears in `debug:bus`. Audit trail for free.
4. **RNG is injected.** `seed = hash(campaignSeed, shift, systemId)`. Never global.
5. **Content is loaded, validated, frozen.** Schema-validated at boot; malformed content fails
   with file+field, not a stack trace.

### 3.2 Directory sketch

```
src/
├─ core/
│  ├─ clock.ts  rng.ts  bus.ts  world.ts  save.ts  content.ts
├─ systems/
│  ├─ patrol/  inspection/  tactical/  crowd/
│  ├─ record/  audit/  sector/  directors/  economy/
├─ render/  (pixi only)
├─ ui/      (dom only)
└─ main.ts
content/    (json; see PROD-METHOD §5)
tests/      (record determinism, audit, temperature, save round-trip)
```

### 3.3 The Record as a store (the keystone data structure)

```ts
class RecordStore {
  append(line: ReportLine): void
  live(shift: number): ReportLine[]           // lifespan > 0
  query(q: RecordQuery): ReportLine[]         // tags, category, actor, classification
  contradictions(lineId: string): string[]
  belief(): SectorBelief                      // what the city thinks happened
  archive(): CityRecord                       // serialised, for OVERSEER
}
```

This must be queryable, not just appendable — OVERSEER *is* a query over it.

---

## 4. The clock

- **Fixed timestep:** 60 Hz sim (`dt = 16.667 ms`). Render interpolates.
- **Timescale** multiplies *accumulated* sim time; it never changes `dt`. This keeps determinism
  intact across pause / plan / focus. (Critical — a naive `dt *= 0.35` breaks replays.)
- **Long operations** (audit, sim tick, dispatch resolution) are discrete, not per-frame.
- **State hash** each shift, logged in dev builds; mismatch = determinism regression.

```ts
// the only correct way
accumulator += realDt
while (accumulator >= STEP) { step(STEP * timescaleMultiplierOfQuantum) }
```

Simpler and safer: run `step()` N times where `N = floor(realDt * timescale / STEP)` with a
residual carry. Documented in `clock.ts` with the reasoning, because this is where engines rot.

---

## 5. Performance budgets (reference: Intel Iris Xe, 1080p, Chrome)

| Budget | Target | Hard limit |
|---|---|---|
| Frame time | 12 ms | 16.6 ms |
| Sim tick (tactical, 40 agents) | 1.5 ms | 3 ms |
| Sim tick (sector, 60 households) | 6 ms | 15 ms (once per shift, not per frame) |
| Draw calls | 60 | 120 |
| Initial payload | 25 MB | 250 MB |
| Memory | 300 MB | 600 MB |
| Save size | 300 KB | 2 MB |

**Techniques:** sprite atlas (one texture), object pooling for agents/corpses/particles, baked
lighting into the tilemap (no runtime 2D lighting), silhouette rendering as pre-baked masks,
audio as `.webm`/opus, lazy-load act-specific content.

---

## 6. Save format & the OVERSEER path

```jsonc
{
  "envelope": { "version": 3, "created": "...", "gameVersion": "1.0.4" },
  "campaign": { "seed": 817231, "shift": 7, "act": 2, "rank": 3, "currencies": {...} },
  "sector":   { /* SectorState */ },
  "households": [ /* 60 records */ ],
  "record":   [ /* ReportLine[] — the Case File, up to ~400 lines */ ],
  "agents":   { /* persistent named NPCs: squad, family, informants */ },
  "flags":    { /* narrative flags, debts, grudges */ }
}
```

- **Versioned envelope + migrations** (`migrations/v2_to_v3.ts`). Never break a save silently.
- **`record` is the OVERSEER import payload.** Its stability is a product requirement (ADR-0002).
- **Export/import as a file** (download `.json`) so players can back up — important for a game
  where a save is a *memory*.

---

## 7. Testing strategy

| Layer | What's tested | Tool |
|---|---|---|
| **Record** | slack math, stability decay, contradiction resolution, belief aggregation | Vitest, table-driven |
| **Audit** | camera-observed lie ⇒ 100% caught; honest ⇒ 0% | Vitest |
| **Sector** | 10 no-input shifts monotone & coherent; temperatures bounds | Vitest |
| **Save** | round-trip hash equality; migration from v1/v2 | Vitest |
| **Determinism** | same seed twice ⇒ same state hash | Vitest + CI |
| **Tactical** | door/noise table, force-continuum logging (1 action = 1 line) | Vitest (headless) |
| **Playable** | gates G0–G3 | humans, recorded |

**CI:** typecheck + lint + unit + a headless 3-shift smoke run with a fixed seed. No screenshots,
no browser E2E until Phase 4 (cost > value early).

---

## 8. Risks specific to tech

| Risk | Mitigation |
|---|---|
| WebGL context loss (laptop sleep) | listen for `webglcontextlost`, rebuild renderer from Core state (possible *because* Core is headless) |
| Mobile/touch users | not supported; show a clear "keyboard + mouse required" notice |
| Browser text input weirdness (IME, autocorrect) | plain `<textarea>`, 240 cap, no rich text; disable autocorrect/grammarguard attrs |
| Audio autoplay policies | start audio on first click; ducking state machine must tolerate a muted context |
| Preview host / origin restrictions | dev server binds `0.0.0.0`; `allowedHosts: true`; no CORS-dependent assets |
| Long-session memory growth (400-line Case File) | Case File is DOM-virtualised; the archive lives in IndexedDB, paged |

---

## 9. What must exist before Phase 1 ends

- [ ] `clock.ts` with determinism test
- [ ] `bus.ts` + `debug:bus`
- [ ] `content.ts` with schema validation
- [ ] `record/store.ts` with the query API (even if only 2 query methods are used yet)
- [ ] `save.ts` with envelope + one migration stub
- [ ] a headless test that runs a fake shift and asserts a state hash
