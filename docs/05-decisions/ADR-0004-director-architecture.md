---
id: ADR-0004
title: Directors are utility-scored storylet decks, not planners
status: accepted
date: 2026-11-18
owner: design
deciders: [design, tech]
supersedes: —
amends: [SYS-DIR-01, SYS-SIM-01]
---

# ADR-0004 · Director architecture

## Context

The GDD specified three directors (Desk, Cell, Eye) plus an Arbiter, but left their internals
undefined. Before Phase 3 we researched how shipped games do this (`06-research/`):

- *Alien: Isolation*: omniscient director + utility job system + a ~100-node BT on the actor.
  Its power comes from the **knowledge gap**, and its purpose is *player-centric chase horror*.
- *Left 4 Dead*: four rules and a 4-state pacing FSM. Valve's own verdict: *"the simplest worked
  really effectively."*
- *RimWorld*: storytellers are scheduled dice with personalities; depth comes from the sim
  underneath and from apophenia.
- *Shadows of Doubt*: per-citizen routines at ~300 agents are achievable; the failure mode is
  repetition and missing connective tissue.

We need directors that (a) are cheap and deterministic enough for a browser build, (b) are
tunable by a designer without code, and (c) can hold **content** (60+ micro-events, 80
directives, family scenes) rather than generating it.

## Decision

1. **A director is a weighted storylet deck plus a small scoring function.** Selecting what
   happens next is: filter eligible content by prerequisites → score by utility (fault-line
   alignment, pacing state, novelty/temperature) → weighted sample. No planning, no search.
2. **The Arbiter is a 4-state pacing FSM** (calm / build / peak / release) borrowed from L4D,
   owning hard budgets rather than content: ≤2 armed incidents per shift, ≥1 quiet scene, no
   archetype repeat within 3 shifts, a de-escalation offer always available above temperature 70.
3. **The Cell plans with HTN-lite**: 3–5 hand-authored 3-step plans, precondition-gated, with
   failure states. Authored, because the player must be able to *discover* plans via informants.
4. **The Eye is a gauge, not a planner**: an attention scalar plus an escalation ladder. Its
   advantage is knowledge the actors lack, delivered as fallible radio hints.
5. **Every director's output is logged with its score** to `debug:bus`. No black boxes (the
   "Law of Small Directors": ≤~120 lines of decision logic each).
6. **Content, not code.** Weights, curves, prerequisites and pacing budgets live in JSON.

## Consequences

**Good**
- Designers tune pacing by editing numbers; no engineer in the loop.
- Deterministic and cheap: a director runs once per shift, not per frame.
- Borrows the proven parts of the literature while avoiding the player-centric framing.
- Content scales linearly with authoring, not exponentially (storylets beat branching).

**Bad / risks**
- Utility decks can feel *samey* if the content pool is thin; the arbiter's novelty rules help
  but the real fix is content volume (RISK R11).
- Scoring is opaque to players by construction; we mitigate with **transparent purpose** (the
  player can name the director's motive) while keeping the maths hidden.
- HTN-lite means the Cell cannot surprise us with genuinely novel strategies; accepted — the
  player's surprise should come from *world state*, not from faction creativity.
- Requires a score inspector early (Phase 3), or utility tuning becomes guesswork.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| One Isolation-style director + a "city skin" | Its every output pushes danger at the player; our world must be indifferent |
| Full GOAP for factions | Search cost and replanning spikes on a browser budget; benefit needs a large action set |
| RimWorld-style pure scheduler | No thematic targeting; our Desk's whole job is probing the player's fault lines |
| Hand-authored linear campaign | Kills replay, and makes the Record's variance pointless |
| Machine-learned/adaptive director | Not debuggable, not deterministic, not shippable by this team |

## Compliance

- `src/sim/directors/*` may not import pathfinding or planners (lint boundary).
- Every director decision emits `{director, candidates[], scores[], chosen, reason}`.
- A test asserts the Arbiter's budgets for 50 consecutive simulated shifts.
- A test asserts no `Math.random` and identical output for identical seeds.

## Revisit if

Playtests show the Deck's output is repetitive after 8 shifts *despite* sufficient content, or if
the Cell's HTN-lite plans are read as arbitrary by testers. In either case the escalation is:
more authored plans (cheap) → utility-scored plan *selection* (medium) → real planner (last resort).
