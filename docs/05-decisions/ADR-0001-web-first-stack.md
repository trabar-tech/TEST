---
id: ADR-0001
title: Web-first stack (PixiJS + DOM UI, headless core)
status: accepted
date: 2026-11-18
owner: tech
deciders: [tech, design]
supersedes: —
---

# ADR-0001 · Web-first stack

## Context

The target is PC-only, browser-first, single-player. The two mechanical pillars (a data-driven
bureaucratic simulation and a 2D top-down tactical layer) both favour a **small, fast, 2D
renderer with a headless simulation core** over a general 3D engine. A future expansion
(OVERSEER) needs to **run tactical scenes without rendering them** and **query the player's
record** — both of which demand a UI-agnostic core.

## Decision

- **TypeScript (strict) + Vite**, static hosting, no backend in v1.0.
- **PixiJS 8** for the world renderer (WebGL2), sprite atlas, baked lighting.
- **DOM** for all UI (the Desk form, docket, Case File, HUD text).
- **Core is pure/headless**, driven by a fixed 60 Hz timestep with an injected seeded RNG, and
  communicates through one typed event bus.
- Rejected: Phaser (opinionated scene/asset model fights a data-driven sim), Godot/Unity web
  exports (payload 30–100 MB+, threading/COOP-COEP friction, worse iGPU performance).

## Consequences

**Good**
- Cheap iteration, tiny payload, instant load, easy sharing via URL.
- The headless core makes unit testing and the OVERSEER dispatch resolver nearly free.
- DOM UI gives accessibility, text input, IME, and keyboard navigation "for free" — essential
  for a game that is *a form*.

**Bad**
- Two styling worlds (Pixi and DOM) must be kept visually coherent.
- WebGL context loss and audio autoplay policies become real engineering problems.
- No mobile/touch, no console — accepted: this is a PC browser game.
- Typed free text cannot be localised; mitigated by a tag-only mode (see RISK R9).

## Revisit if

The project becomes desktop-first (then Godot's web export problem disappears), or the tactical
layer needs >200 simultaneous agents (then move to WebGL instancing or WebGPU).

## Compliance

- Lint rule bans `Math.random` outside `core/rng.ts`.
- `src/core/**` may not import `pixi.js` or touch `window` (enforced by a lint boundary rule).
- State hash test runs each shift in dev builds.
