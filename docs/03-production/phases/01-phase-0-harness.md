---
id: PH-0
title: "Phase 0 — Harness (2–4 sessions)"
status: implemented
owner: tech
depends_on: [TECH-01, ADR-0001]
consumed_by: [PH-1]
updated: 2026-11-18
---

# Phase 0 — Harness

**Thesis of this phase:** the project's biggest hidden risk is not design, it's that *the clock,
the save and determinism will rot silently* and be discovered in Phase 4 when the campaign can't
be replayed. Spend four sessions now; save forty later.

**There is no gate.** Phase 0's exit is a checklist, and its deliverable is boring: a window that
runs an empty sector at 60 fps, deterministically, with saves that round-trip.

> **Implemented 2026-11-18, one session, all seven task cards.** Invariants only below; the
> reasoning lives in the code comments. Read `src/core/*` for the contract, `tests/*` for the
> proof. Anything in this file that is not an invariant has been deleted, per the docs-die rule.

---

## 1. Scope

**In:** build tooling, fixed-timestep clock with seeded RNG, event bus + debug overlay, ECS-lite
store, IndexedDB save with envelope + migration, tilemap + A* with body collision + click-to-move,
the timescale engine, the content loader with schema validation, lint boundaries.

**Out (deliberately):** any gameplay. No inspection, no citizens with routines, no combat, no UI
beyond a debug panel. If it feels like a game by the end of Phase 0, something was over-built.

---

## 2. Invariants (formerly task cards)

### P0-T01 · Build + render skeleton
- Vite + TS strict, PixiJS 8, `0.0.0.0` bind, permissive `allowedHosts`.
- No external asset or font request: the app must run in a network-less sandboxed iframe.
- `index.html` is the only HTML; every style is inline, in a `<style>` block, or `theme.css`.

### P0-T02 · Fixed-timestep clock + seeded RNG
- `step()` always receives `1/60`, never a variable dt.
- Every random draw comes from `streamFor(seed, shift, systemId)`. `Math.random` is banned
  outside `core/rng.ts` and the ban is *enforced*, not documented.
- **A save carries every RNG stream position.** Learned the hard way: without it a reload
  re-rolls the shift and the audit can never be reproduced (P0-T04 acceptance depended on this).

### P0-T03 · Entity store + event bus + debug overlay
- Entities are iterated in id order, always; no Map insertion-order dependence.
- The bus is the only debugging surface and it is a ring buffer, so it cannot grow unbounded.
- The overlay lives in DOM, not Pixi: crisp text at any DPI, and no cost to rebuild.

### P0-T04 · Save/load with envelope + migration
- `SAVE_VERSION = 2`; migrations are mandatory and one-way (`v0 → v1 → v2`).
- A save from a *newer* build fails with a readable message instead of half-loading.
- Unknown time mode, corrupt `record`, corrupt `rng`, missing `seed` → `SaveError`, never `undefined`.
- One slot until Phase 4.

### P0-T05 · Tilemap + A* + click-to-move
- Deterministic neighbour order, octile heuristic, no corner cutting, capped node budget.
- **Path cost budget: 40 simultaneous requests under 2 ms.** This needed a typed-array heap, a
  per-call scratch pool keyed by generation stamp, unrolled neighbours, and a bounded
  string-pull lookahead. Measured 0.25 ms/path after, from 1.4 ms/path before.
- **Collision is a circle, not a point.** A smoothed segment that only grazes a corner is still a
  clip, so smoothing tests a swept body (`circleClear` / `segmentClear`).

### P0-T06 · Timescale engine
- Timescale multiplies real time consumed per step; it never changes `dt`.
- Mode changes are queued and applied at a frame boundary *before* consuming time, so clicking
  pause cannot fast-forward up to a second of simulation.
- Time under pause is **discarded**, not banked; a stalled tab is capped at `maxFrameMs = 250`
  and `maxStepsPerFrame = 5`, so a debugger pause cannot rewind the fiction.

### P0-T07 · Content loader with schema validation
- Zod schemas, strict where authoring mistakes hide (`requires`), frozen output.
- Errors read `file: path — message`. `npm run validate` runs the *same* loader as boot, so
  "passes the CLI" and "boots" cannot diverge.

---

## 3. Exit checklist — all green 2026-11-18

- [x] `npm run dev` serves on `0.0.0.0:5173`
- [x] `npm run verify` green: **118 tests** — determinism, save round-trip, migration, content,
      nav, body collision, timescale, camera math, and the sim end-to-end
- [x] Click moves the pawn around a wall at 60 fps; body never overlaps a wall tile
- [x] Save → reload → continue reaches the identical state hash, including a half-walked route
- [x] `debug:bus` shows every message with tick + type, filterable by system, `` ` `` to hide
- [x] Clicking moves the pawn to where it was clicked, on both renderers (one shared camera)
- [x] `npm run check:boundaries` fails on `Math.random` outside `core/rng.ts`, on Pixi/DOM in
      `core/`, on `core → render|ui` imports, and on `truth` inside an authored claim
- [x] Malformed content fails at boot with file + field, and offers a way forward

## 4. Deliberate deviations from the plan

| Plan | Built | Why |
|---|---|---|
| IndexedDB wrapper inside `core/save.ts` | `SaveStorage` interface in core, adapter in `src/platform/storage.ts` | The boundary check was right: `core/` may not touch `indexedDB`. Falls back to localStorage, then memory, and says so. |
| "migrations/ folder with a no-op v1→v2" | real v1→v2 (record move + rng table) | The rng table is not optional; see P0-T02. |
| WebGL only | Pixi 8 with a Canvas2D fallback, named in the debug panel | This is a browser game: locked-down laptops, VMs and sandboxed iframes frequently have no WebGL, and a WebGL-only build shows a dead boot screen there. The fallback shares the camera and the sim with the Pixi path. |
| 2–4 sessions | 1 session | The docs had already settled the hard questions, so this was transcription plus debug. **Do not read that as a schedule forecast for Phase 1**, whose unknowns are design, not plumbing. |

## 5. Exit note

*Date · sessions used · what slipped · what was cut · state hash of the exit build.*

2026-11-18 · 1 session · nothing slipped · nothing cut · seed 42, 10,000 ticks, hash asserted in
`tests/determinism.test.ts`. The three bugs worth remembering were all *architectural*, not
cosmetic: a queued timescale scaled the wrong accumulator, a shallow world snapshot aliased
component objects, and movement orders lived outside the entity so saves lied about them.
