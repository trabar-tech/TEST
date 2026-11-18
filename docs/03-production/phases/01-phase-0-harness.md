---
id: PH-0
title: "Phase 0 — Harness (2–4 sessions)"
status: review
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

---

## 1. Scope

**In:** build tooling, fixed-timestep clock with seeded RNG, event bus + debug overlay, ECS-lite
store, IndexedDB save with envelope + migration stub, tilemap + navmesh + A* click-to-move for a
single pawn, the timescale engine, the content loader with schema validation, lint boundaries.

**Out (deliberately):** any gameplay. No inspection, no citizens with routines, no combat, no UI
beyond a debug panel. If it feels like a game by the end of Phase 0, something was over-built.

---

## 2. Entry criteria

- [ ] Docs approved: `ADR-0001`, `TECH-01`, `ADR-0002` (the Record shape must exist before any
      code, because the save format depends on it)
- [ ] A reference machine that is *worse* than the target (integrated GPU, 8 GB RAM, 1080p)
- [ ] Repository skeleton: `src/core`, `src/systems`, `src/render`, `src/ui`, `content/`, `tests/`

## 3. Exit criteria

- [ ] `npm run dev` serves on `0.0.0.0` and loads in a browser at the preview URL
- [ ] `npm test` runs green: determinism, save round-trip, content validation, timescale math
- [ ] A click anywhere walkable moves a pawn around a wall, at 60 fps
- [ ] Saving, reloading, and continuing produces an identical state hash
- [ ] `debug:bus` shows every system message with timestamps
- [ ] Lint fails if `Math.random` appears outside `core/rng.ts`, or if `src/core/**` imports Pixi
      or touches `window`
- [ ] `content/*.json` that is malformed fails at boot with file + field, not a stack trace

---

## 4. Task cards

### P0-T01 · Build + render skeleton
- **Why:** everything needs a place to run. `ADR-0001`.
- **What:** Vite + TS strict; Pixi 8 app; one atlas texture; a 32×32 placeholder sprite; a resize
  handler; an FPS counter; `0.0.0.0` bind with permissive `allowedHosts` so previews and iframes
  work.
- **Acceptance:** open the preview URL on a phone-sized window and a 1080p desktop window; the
  scene resizes without letterboxing bugs; 60 fps.
- **Not included:** audio, loading screens, asset pipeline beyond one atlas.
- **Cut candidate:** atlas → individual textures (slower but unblocks).

### P0-T02 · Fixed-timestep clock + seeded RNG
- **Why:** the whole game's replayability, the audit tests, and OVERSEER's headless dispatch
  depend on this being *correct*, not approximately correct.
- **What:** accumulator loop at 60 Hz; `step()` receives a fixed `dt`; render interpolates;
  `seed = hash(campaignSeed, shift, systemId)`; a state-hash function (stable stringify of
  canonical sim state → 64-bit).
- **Acceptance:** running seed 42 twice for 10,000 ticks produces the same hash; 60 Hz sim with a
  30 fps render produces identical sim results to 120 fps render.
- **Not included:** rollback, networking, save-format versioning (that's T04).
- **Cut candidate:** none. This task is non-negotiable. If it slips, Phase 1 slips.

### P0-T03 · Entity store + event bus + debug overlay
- **Why:** the Record is an event log; the audit is a query over it. The bus is the debugging and
  testing surface for everything downstream, and `ADR-0004` requires *every director decision to
  be traceable through it*.
- **What:** ECS-lite (component arrays, stable IDs, no archetype machinery); typed `EventBus`;
  ring-buffer log; overlay listing the last N messages, filterable by system.
- **Acceptance:** a test emits 1,000 events of 3 types and the overlay filters correctly; the log
  survives a pause/unpause with correct ordering.
- **Not included:** persistence of the bus (the Record is a *separate*, persistent store).
- **Cut candidate:** the overlay UI (keep the bus + console logger).

### P0-T04 · Save/load with envelope + migration stub
- **Why:** the save is the player's memory (`ADR-0002`); the Case File is the OVERSEER import.
  A versioning mistake here is unrecoverable later.
- **What:** IndexedDB wrapper; `{envelope:{version, created, gameVersion}, campaign, sector,
  households[], record[], agents{}, flags{}}`; `migrations/` folder with a no-op v1→v2 example;
  export/import as a `.json` file.
- **Acceptance:** save → reload → state hash identical; a hand-edited v1 save migrates to v2 and
  loads; a corrupt save fails with a readable message and offers "start new" rather than a
  white screen.
- **Not included:** cloud sync, multiple save slots (one slot until Phase 4).
- **Cut candidate:** export/import (Phase 4) — but keep versioning.

### P0-T05 · Tilemap, navmesh, A* click-to-move
- **Why:** the Beat's readability depends on movement feeling solid before any content exists.
- **What:** tile JSON → collision map; navmesh from a flood fill; A* with a tiny binary heap;
  path smoothing; a pawn that follows the path with acceleration damping.
- **Acceptance:** click through a doorway and around a corner; the pawn does not clip corners;
  a blocked path produces "no route" feedback rather than a freeze; 40 simultaneous path
  requests complete in < 2 ms.
- **Not included:** doors (state machine is Phase 2), dynamic obstacles, formations.
- **Cut candidate:** path smoothing (visibly worse, functionally fine).

### P0-T06 · Timescale engine
- **Why:** RTwP, Plan (0.15), Focus (0.35) and Pause (0.0) are all *one clock*
  (`SYS-TACT-01` §1). Get the math right once.
- **What:** modes with typed transitions; residual accumulator carry so slow-mo doesn't lose
  sim time; a debug slider; a guard that changing timescale mid-step is queued, never applied
  inside `step()`.
- **Acceptance:** switch 1.0 → 0.0 → 0.35 → 1.0 repeatedly for 60 s and the total sim time
  elapsed equals the expected sum within 1 tick; determinism hash unchanged by timescale changes.
- **Not included:** stamina/budget rules for Focus (Phase 2).
- **Cut candidate:** none (it's cheap and Phase 2 depends on it).

### P0-T07 · Content loader with schema validation
- **Why:** 40%+ of the project is JSON content (`PROD-METHOD` §5, ADR-0004). Bad content must fail
  loudly at boot with `file + field`, not as a mystery `undefined` three shifts in.
- **What:** Zod schemas for the storylet, directive, citizen, incident and map types; a loader
  that validates and freezes; a `--validate` CLI mode for authoring.
- **Acceptance:** deleting one required field from `content/examples/content.sample.json` produces
  `content/…json: micro_events[0].requires.temperature — expected array`.
- **Not included:** hot reload of content (Phase 3 nice-to-have).
- **Cut candidate:** freezing (minor perf).

---

## 5. Session plan (2–4 sessions)

| Session | Do | End state |
|---|---|---|
| A | T01 + T02 | a deterministic empty loop at 60 fps |
| B | T03 + T04 | reload restores identical state |
| C | T05 + T06 | a pawn you can walk, in slow motion |
| D (buffer) | T07 + debt | validation + exit checklist |

## 6. Exit note (fill in on completion)

*Date · sessions used · what slipped · what was cut · state hash of the exit build.*
