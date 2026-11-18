---
id: RES-DIR-01
title: Director AI Anatomy — Isolation, L4D, RimWorld, Shadows of Doubt, Storylets
status: approved
owner: design
depends_on: [RES-INDEX]
consumed_by: [SYS-DIR-01, ADR-0004]
updated: 2026-11-18
---

# Director AI Anatomy

## 1. Alien: Isolation — the honest anatomy

### 1.1 What it actually is

Two systems, not one "AI":

```
┌──────────────────────────────── "Big Brain" ────────────────────────────────┐
│  DIRECTOR (macro, omniscient)                                               │
│  knows the player's exact position, always                                 │
│  owns a MENACE gauge: rises with (a) alien within short walking distance,   │
│  (b) line of sight on the alien, (c) close on the motion tracker *and* able │
│       to reach the player quickly                                          │
│  output: periodic JOBS  =  { task, target location, priority }              │
│  priority decides: finish current job / blend toward this one / interrupt  │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │  hints only — never the exact position
┌───────────────────────────────────▼─────────────────────────────────────────┐
│  ALIEN (micro, situated)                                                    │
│  behaviour tree: ~100 nodes, ~30 responsible for top-level selection        │
│  nodes LOCKED at start; unlocked by player behaviour as the game progresses   │
│  sensors: footsteps, running, gunshots, motion tracker at ~1.5 m            │
│  pathfinding: visits a perimeter of "search locations"; "spot locations"    │
│    where it stands and turns; deliberately sub-optimal (backtracking reads  │
│    as doubt)                                                                │
│  PROTECTED ZONES: places the alien is forbidden to look, for fairness       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 What the reputation gets wrong

The community narrative is "the alien learns and remembers you" / "it has a huge AI". The
published anatomy is more modest and more instructive:

- The **learning** is node unlocking gated on player-behaviour counters. It is authored
  progression dressed as adaptation, and it works because **players can't see the tree**.
- The **intelligence** is a utility job system with three or four inputs.
- The **tension** is not decision quality at all — it is the *gap* between knowing and finding.
  The Director can always point the alien roughly at you; the alien still has to search.
  That gap is where the horror lives.

> **Transferable law:** a systemic antagonist feels intelligent when it *knows more than it can
> act on*, and acts on *less than it knows*. Not when its planner is clever.

### 1.3 Why the structure does not transfer as-is

The user's instinct was right. Its **purpose** is player-centric chase horror:

| Property of Isolation's director | Fit for CIVIC ORDER |
|---|---|
| Single antagonist with one intent (reach the player) | ✗ we need 3 factions + the state all pursuing different goals |
| Every output is "move danger toward/away from player" | ✗ our world must be indifferent; the player is one input |
| Omniscience is fine because the antagonist is *supposed* to feel unfair | ✗ our unfairness is **bureaucratic**, not predatory; it must be *legible* |
| Menace = fear | ✗ our equivalent is **scrutiny**, not fear |
| Long stalking sessions | ✗ a 30-min shift cannot afford one 45-minute stalk (see the pacing critique of Isolation itself) |

### 1.4 What transfers (and is now in the specs)

| Mechanism | Our use | Spec |
|---|---|---|
| Two-brain split | The **Eye** knows everything; **wardens and citizens** know only what they perceive. The Eye's knowledge reaches them as **radio calls that can be wrong or late**. | SYS-DIR-01 §8 |
| Menace gauge | **Oversight Attention** (§4.3): how closely the Eye is watching *you*, from proximity of evidence, contradictions, and camera coverage. | SYS-SIM-01 |
| Utility job system with priority levels | The **Desk's** incident scoring: `{ archetype, target, priority }` with interrupt semantics | ADR-0004 |
| Node unlocking | Faction behaviour sets unlock by act + antagonism rung | SYS-SIM-01 §4 |
| Sub-optimal search / backtracking | Patrol & search behaviour: units double back, "check" things, so they read as thinking | SYS-TACT-01 §7 |
| Protected zones | **Fairness doctrine** (SYS-DIR-01 §7): no ambush on a first visit to a room, no unfair camera catch, no untelegraphed lie punishment | SYS-DIR-01 §7 |

---

## 2. Left 4 Dead — the smallest director that works

Booth's GDC 2009 talk is the most useful four paragraphs in the literature:

1. Estimate the **emotional intensity** of each survivor.
2. Track the **max** intensity of the group.
3. If intensity is too high → **remove all major threats** for a while.
4. Otherwise → create an interesting population of threats.

Driven by a **four-state FSM** (calm / build-up / peak / release). The rest of the system is
*structured unpredictability*: layered, simple, tunable algorithms, not one opaque brain.

**Adopted wholesale as a design law:**

> **Law of Small Directors.** No director in this game may exceed ~120 lines of decision logic.
> If a director needs more, it is two directors. Every output must be traceable in `debug:bus`
> with the score that produced it.

**Rejected:** flow-distance / active-area-set population. We have one small sector; there is no
streaming problem, and pretending otherwise adds machinery for nothing.

---

## 3. RimWorld — storytellers are dice with a personality

The important correction to common belief: RimWorld's storytellers **do not analyse how you
play**. They schedule events with different pacing parameters and a few situational gates.
Cassandra = rising tension; Phoebe = long peace then a heavy hit; Randy = no rules.

What actually produces the stories is:

- **A deep simulation underneath** (moods, relationships, injuries, wealth).
- **A small cast** — ~12 colonists, chosen so the player can hold each person in their head.
- **Apophenia** — Sylvester: players *"extract more story meaning from a game event than is
  really represented in the mechanics."*

### 3.1 Adopted

1. **Small cast rule.** The player can *know* at most **12 named citizens** at a time. The other
   ~48 households are records with faces only when materialised. Naming everyone destroys
   apophenia by diluting attention.
2. **Personality over intelligence.** Our three directors are three *appetites*, not three
   planners (the Desk wants thematic pressure; the Cell wants to win; the Eye wants to see).
3. **Transparent purpose, opaque maths.** Players should be able to say "the Desk is testing my
   cruelty again" without knowing the weights. This is the exact inverse of Isolation (opaque
   purpose, hidden tree) and it fits our genre: bureaucracy is legible, its arithmetic isn't.
4. **"If something's really hard to do, don't do it."** (Sylvester) — cited in ADR-0004 as the
   tie-breaker for any architecture argument.

### 3.2 Rejected

Letting the player pick a storyteller. Our three directors are the regime's moods; **the regime
chooses**, the player endures. That inversion is thematically load-bearing.

---

## 4. Shadows of Doubt — proof of scale, warning about repetition

- 250–300 citizens, per-citizen schedules (4–10 journeys/day), relationships, jobs and
  residences; a small city (~5–9 blocks) chosen explicitly so that *"everywhere is simulated"*.
- **Solvability failsafes**: the killer always leaves at least one clue; the newspaper publishes
  scene contents so a missed clue is recoverable; a failed case produces another murder (more
  clues). Authored guarantees wrapped around generated content.
- Criticisms are consistent and instructive: *repetitive*, dialogue repeats, and cases
  *"lack actual connective tissue"*.

### 4.1 Adopted

| Lesson | Our implementation |
|---|---|
| Small area, total simulation | 4 blocks, 60 households, every interior enterable |
| Per-citizen routines with 4–10 stops | Archetype day plans, chosen routes (SYS-SIM-01 §3) |
| Solvability failsafes | **Every incident clearable at rung ≤2 with one recon token**; authoring checklist item |
| Materialise detail only where the player looks | Agents materialise from households on demand (SYS-SIM-01 §4) |
| A connective UI (crime board) | The Case File + Act II **Threads** board (links report lines visually) |

### 4.2 The warning we must engineer against

Shadows of Doubt's weakness is not simulation quality — it is **lack of connective tissue**: each
case is an island. Our entire thesis (the Record) *is* connective tissue. So the mitigation is a
budget rule:

> **Connective-tissue budget.** At least 40% of authored content must *reference* prior state
> (a named citizen, a filed line, a faction grudge, a family event). A micro-event that could
> happen in any run, to anyone, on any day, is a B-tier event and gets lower weight in the deck.

---

## 5. Storylets / quality-based narrative — the content architecture

The general shape (Failbetter / Emily Short):

```
storylet = {
  content:        text / scene / card,
  prerequisites:  predicates over "qualities" (our: report lines, tags, standing, grudges, shift),
  effects:        quality changes (our: SectorBelief, stability, grudge, flags)
}
deck = weighted sample of all storylets whose prerequisites are currently satisfied
```

Why this and not a branching tree, for us:

| Property | Storylets | Branching tree |
|---|---|---|
| Content reuse | high — every storylet is independently valid | low — branches multiply |
| Authoring cost | linear in content | exponential in depth |
| Fit with simulation state | excellent (prereqs *are* sim queries) | poor (state must be forced into the tree) |
| Failure mode | incoherence / repetition | combinatorial explosion |

**Adopted as the content format** for micro-events, directives, family scenes, radio barks and
epilogue callbacks. In our specs, a micro-event's `resolutions` are the branches; its `weight`
and `temperature` gates are the prerequisites; its `claim` is the effect on the Record.

**Refinement adopted from Emily Short — the opportunity deck.** Some content should be *drawn*,
not merely *available*: requisition offers, Syndicate favours, Congregation pleas. Deck
composition becomes a second-order strategy (do I take the ammo card or the medicine card?).

**Refinement adopted — epilogue storylets.** Delayed content that fires 3–6 shifts after its
cause. This is exactly how a silenced witness or a protected family should resurface, and it is
cheap: it needs a timestamp and a predicate, not a script.

---

## 6. The Nemesis system — the thing we must NOT build

Middle-earth's Nemesis system: procedurally generated characters who *remember* encounters,
gain scars and traits from them, are **promoted through an enemy hierarchy**, and develop
rivalries with the player. It is exceptional design, and it is **patented** (Warner Bros.;
coverage places expiry around 2035), covering remembered characters and hierarchy promotion
based on player interaction.

Because this project may be sold, the boundary is explicit:

| We DO | We DO NOT |
|---|---|
| Store **records** of what happened, as text and data | Generate characters whose *traits and appearance are authored by the encounter* |
| Let a citizen's **disposition** change because of a specific filed line | Run a **ranked enemy hierarchy** where defeating/killing promotes rivals |
| Reference a person's own report line back at them | Build a "nemesis" who returns with a scar and a grudge arc |
| Promote **the player**, not the enemy | Promote enemies based on their encounters with the player |
| Let grudges decay through in-fiction actions (restitution, amnesty) | Let grudges generate an endless procedural rival roster |

The distinction that matters: **our memory is archival, theirs is dramaturgical.** We remember
what was written down (and the player wrote it); they invent a villain from what happened. If a
feature here starts to feel like "the game is growing a rival", it goes to `05-decisions` for a
legal read before it ships.

---

## 7. Synthesis: what our director stack becomes

```
                 ┌──────────────────────────────────────────────────┐
                 │  ARBITER  (pacing FSM, L4D-style, ~80 lines)     │
                 │  calm → build → peak → release, per shift        │
                 │  budgets: ≤2 armed incidents, ≥1 quiet scene,    │
                 │  no archetype repeat in 3 shifts, ≥1 de-escalation│
                 │  offer above temperature 70                      │
                 └───────┬──────────────────┬───────────────────────┘
                         │ arbitrates       │ arbitrates
        ┌────────────────▼───┐   ┌──────────▼─────────┐   ┌──────────────────┐
        │ DESK (pressure)    │   │ CELL (insurgency)  │   │ EYE (oversight)  │
        │ utility-scored     │   │ HTN-lite 3-shift   │   │ attention gauge  │
        │ storylet deck,     │   │ plans; behaviour   │   │ + escalation     │
        │ weighted by fault  │   │ sets unlocked by   │   │ ladder; hints to │
        │ line vector        │   │ act/antagonism     │   │ wardens (fallible)│
        └────────────────────┘   └────────────────────┘   └──────────────────┘
```

Each is small on purpose. Each is inspectable. Their **disagreement** is the content — that is
the one thing no single-director game (Isolation, L4D) can give us, and the reason the three-
director structure survives contact with the research.
