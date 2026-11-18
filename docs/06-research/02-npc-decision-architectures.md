---
id: RES-ARCH-01
title: NPC Decision Architectures — utility, BT, HTN, GOAP, and what we use where
status: approved
owner: tech
depends_on: [RES-INDEX]
consumed_by: [SYS-TACT-01, SYS-SIM-01, src/ai]
updated: 2026-11-18
---

# NPC Decision Architectures

## 1. The four families, honestly compared

| Family | What the designer iterates on | Strength | Weakness | Shipped examples |
|---|---|---|---|---|
| **FSM** | transitions between modes | trivial to debug, no tuning surface | combinatorial explosion past ~6 states | most enemies, ever |
| **Utility / IAUS** | *response curves and weights* | smooth, multi-input, re-tunable without restructure; cheapest to balance | can look "twitchy"; needs maths literacy | The Sims, XCOM: EU, *Alien: Isolation*'s director job system, BioShock Infinite's companion |
| **Behaviour tree** | *tree shape* | readable, modular, easy to gate | grows into spaghetti; weak at "should I be doing something else entirely" | Halo, *Alien: Isolation*'s alien, most UE projects |
| **GOAP / HTN** | *action catalogue & goals* | emergent multi-step plans | search cost, replanning spikes, brittle with big action sets | F.E.A.R. (GOAP, ~small set), Killzone, Transformers: Fall of Cybertron |

Two quotes worth pinning to the wall:

- On GOAP: *"F.E.A.R.'s original implementation worked partly because they kept the action set
  deliberately small and the world state representation lean. That constraint is easy to violate
  as a project grows."*
- On BT: *"Utility scoring is great at 'what's the best action right now' but awkward at 'when
  should I fundamentally change what I'm doing.' Flip those responsibilities and both tools stay
  manageable."*

I.e. the mature answer is **hybrid, per layer**, not one architecture for the whole game.

---

## 2. Our constraint set (this is what decides it)

| Constraint | Consequence |
|---|---|
| Browser, 60 fps, integrated GPU | no per-frame planner searches; nothing that can spike |
| Headless core (must run in Vitest + OVERSEER resolver) | AI must be deterministic and cheap to tick 40 agents |
| Officers are **literal executors** by design | squad AI must be *simple*; complexity would fight the fantasy |
| Citizens need believable routine, not intelligence | schedule-driven, not planning |
| Factions need 3-shift **intent** | small plan structure, not a search |
| Designers must tune content, not code | utility curves + storylet weights live in JSON |

---

## 3. Assignment (the actual decision)

| Agent class | Architecture | Cost model | Why |
|---|---|---|---|
| **Player's officers** | **Small behaviour tree, 12–20 nodes** + a 4-deep order queue | ~1 µs/agent/tick | Orders arrive from the player; the BT only decides *how* to execute (path, cover, door handle, shoot). Literal execution is a *feature*. |
| **Hostiles (Cell, Syndicate)** | **Utility scoring over ~10 actions** + 2–3 scripted "stances" | ~5 µs/agent/tick, re-score at 4 Hz | Needs to feel reactive (flank, take cover, flee, surrender) without planner cost. |
| **Civilians on screen** | **Schedule + local steering**, no decision loop | ~0.5 µs/agent/tick | They're going somewhere; deviation is a *flag*, not a decision. |
| **Crowd** | **Mood graph** (heat scalar) + leader broadcast | O(leaders + n) | See SYS-TACT-01 §6 — decisions are aggregate, not per-agent. |
| **Off-screen households** | **Pure update function** (no agents at all) | ~0.1 µs/household/shift | Diegetic truth: the 400 people you never see are a spreadsheet, and that's correct. |
| **Factions (the Cell)** | **HTN-lite**: 3–5 hand-authored plans, each 3 steps, precondition-gated | per shift | Plans must be *discoverable* by the player, which requires authoring, not emergence. |
| **Directors** | **Utility-scored storylet decks** + L4D-style 4-state pacing FSM | per shift | ADR-0004. Content lives in JSON; tuning is weights. |
| **The Eye** | **Attention gauge** (a handful of scalars) + escalation ladder | continuous | Its "intelligence" is knowing things the actors don't. |

**Rejected outright:** GOAP for anything. Our action sets would be small enough that GOAP's
benefit never materialises, and its replanning spikes are exactly what a browser build cannot
afford. HTN-lite gives us the same authoring control for the Cell with none of the search.

---

## 4. The one place we borrow from Isolation's alien

Not its tree — its **"search locations vs. spot locations"** behaviour, and its deliberate
**sub-optimal pathing**. Two cheap tricks that make an agent read as *thinking*:

1. **Double-back.** When a unit has no order and no target, it walks to the last place of
   interest, pauses, then returns ~40% of the distance and re-checks. Reads as doubt.
2. **Stand-and-look.** On arrival at a point of interest, the unit holds and rotates through two
   facing sectors before resuming. Reads as attention.

Both are 20 lines. Both are what players actually perceive. (And both are *tunable* — frequency,
duration and percentage travel in config, not code.)

---

## 5. Tuning and debuggability requirements

Because we chose utility scoring, the following are non-negotiable:

1. **Response curves are content, not code.** Every action's axes live in `content/ai/*.json`
   with named curves (`linear`, `sigmoid`, `bell`, `threshold`) and weights.
2. **A score inspector.** Hovering an agent in dev shows each candidate action's axis values and
   final score. Without this, utility tuning is guesswork.
3. **Determinism.** Utilities are evaluated from sim state only; no wall-clock, no `Math.random`.
   Ties broken by stable ID order.
4. **Stability.** Scores are smoothed (`score_t = lerp(score_{t-1}, score_t, 0.3)`) to prevent
   twitchy oscillation — the classic utility-AI failure mode.
5. **Hysteresis on state-ish decisions** (pursue vs. flee): require a margin of 0.15 to switch.

---

## 6. Estimated per-tick budget (40 live agents)

| Layer | Per agent | ×40 | Budget share |
|---|---|---|---|
| Officer BT + queue | 1.0 µs | 40 µs | — |
| Hostile utility (4 Hz, amortised) | 0.3 µs | 12 µs | — |
| Civilian schedule + steering | 0.5 µs | 20 µs | — |
| Perception (vision cones, 2 Hz) | 1.2 µs | 48 µs | the real cost |
| Crowd mood | — | 5 µs | — |
| **Total** | | **~125 µs** | ~0.8% of a 16 ms frame |

Perception will be the expensive part, not decision-making. Mitigation: spatial hash + 2 Hz
vision refresh + LOS cache. This is recorded as a Phase 2 budget item (`P2-T07`).

---

## 7. Sources for this document

See `00-index.md` §4 items 1, 3, 12 (Thompson; Booth; Mark / architecture comparison). The
utility-vs-BT-vs-GOAP framing and the "flip the responsibilities" advice are drawn from the
Socratopia chapter summary and the practitioner thread in item 12; the GOAP cost warning is from
the same.
