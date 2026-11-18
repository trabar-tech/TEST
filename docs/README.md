# CIVIC ORDER — Documentation System

> **codename:** `hesper` · **working title:** *CIVIC ORDER*
> **build target:** single-player · PC · browser-first (WebGL2)
> **doc system version:** 1.0 · **last verified:** 2026-11-18

This repository is the single source of truth for the game. The game code, when it exists,
is *generated from and checked against* this folder. Nothing here is decoration: every
document has an owner, a status, and a downstream consumer (a system, a phase, or a test).

---

## 1. Why a docs system at all

A GDD is not a bible. Used badly it becomes a novel nobody reads; used well it is a
**compression format for decisions** — it lets a human director and an agent work on the
same game across many sessions without re-deriving the design each time.

So the rules are:

1. **Write decisions once, near the thing they constrain.** Vision lives in one file,
   system detail in another, and neither duplicates the other — they link.
2. **Every claim is testable or it is marked as a hypothesis.** `HYPOTHESIS:` means
   "prototype before trusting this".
3. **Documents have status and can die.** `draft → review → approved → implemented → deprecated`.
   Deprecated documents stay (they explain *why* things are the way they are).
4. **The docs shrink as the game grows.** A finished system's spec is deleted down to
   its invariants; the rest lives in code, tests and content data.
5. **Playable beats written.** If a doc and a build disagree, the build wins and the doc
   gets fixed in the same session.

---

## 2. Folder map

```
docs/
├─ README.md                    ← you are here: the system, conventions, workflow
├─ 00-pitch.md                  ← one page. The game in 400 words. Read this first.
├─ 01-gdd.md                    ← the GDD proper (vision, loop, systems, world, economy)
├─ 02-systems/                  ← implementation-facing specs, one per system
│   ├─ 00-index.md              ← system registry + dependency graph + status board
│   ├─ 01-tactical-layer.md     ← RTwP, squad orders, force continuum, breaches, crowds
│   ├─ 02-inspection-and-record.md  ← documents, interrogation, the Record, Paper Truth
│   ├─ 03-simulation-and-directors.md ← sector sim, directors, escalation, incidents
│   ├─ 04-progression-economy.md
│   └─ 05-overwatch-expansion.md
├─ 03-production/
│   ├─ 00-method.md             ← how docs→game actually runs (the process critique)
│   ├─ 01-roadmap.md            ← the one-line phase view, task IDs, cut list
│   ├─ 02-risk-register.md
│   └─ phases/                  ← THE BUILDABLE PLAN: per-phase scope, task cards, gate scripts
│       ├─ 00-phase-index.md    ← start here: standing rules, gate protocol, schedule breaks
│       ├─ 01-phase-0-harness.md
│       ├─ 02-phase-1-record-slice.md
│       ├─ 03-phase-2-tactical.md
│       ├─ 04-phase-3-sim-directors.md
│       ├─ 05-phase-4-campaign.md
│       ├─ 06-phase-5-release.md
│       └─ 07-phase-6-overseer.md
├─ 04-tech/
│   └─ 01-tech-design.md        ← web stack, architecture, budgets, determinism
├─ 05-decisions/                ← ADRs: irreversible choices + the reasoning
│   ├─ ADR-0001-web-first-stack.md
│   ├─ ADR-0002-paper-truth.md
│   ├─ ADR-0003-original-ip.md
│   └─ ADR-0004-director-architecture.md
├─ 06-research/                 ← prior art: what shipped games do, adopted/rejected ledger
│   ├─ 00-index.md              ← the ledger + sources (read before designing AI/sim/content)
│   ├─ 01-director-ai-anatomy.md
│   └─ 02-npc-decision-architectures.md
├─ _templates/                  ← copy these; do not invent new formats
│   ├─ system-spec.md
│   ├─ task.md
│   ├─ adr.md
│   └─ shift-spec.md
└─ glossary.md                  ← in-fiction and mechanical vocabulary (canonical)
```

Content data lives outside `docs/`, in `content/` (JSON), because it is *data the game
loads*, not prose. Examples and schemas of each content type live in `content/examples/`.

---

## 3. Front-matter convention

Every document starts with this block. The fields are machine-readable on purpose — later,
a small script can build the status board and fail CI when a doc is stale.

```yaml
---
id: SYS-TACT-01
title: Tactical Layer
status: draft            # draft | review | approved | implemented | deprecated
owner: design            # design | tech | narrative | production
depends_on: [SYS-SIM-01, ADR-0002]
consumed_by: [phase-2, src/sim/combat]
updated: 2026-11-18
---
```

**Staleness rule:** if `updated` is older than the last change in `consumed_by`, the doc is
suspect. Fix or re-verify; don't silently trust it.

**Status meanings**

| status | means | who can move it forward |
|---|---|---|
| `draft` | thinking out loud; expect contradictions | design |
| `review` | challenged once, open questions listed | design + human director |
| `approved` | locked enough to build against | human director |
| `implemented` | code exists that matches; spec is now an invariant list | tech |
| `deprecated` | superseded; kept for the *why* | anyone, with a pointer to successor |

---

## 4. Task ID convention

`P<phase>-T<nn>` — e.g. `P2-T07`. One task = **0.5–2 sessions** of work, **one unknown**,
and **one playable check**. Task format is in `_templates/task.md`. The rule that keeps this
sane:

> A task is not done when code is written. It is done when the **acceptance check** can be
> run by someone who did not write it, in the browser, without reading the code.

Task states: `todo → in-progress → playable → verified → cut`. `cut` is a legitimate,
recorded outcome — see the Cut List in the roadmap.

---

## 5. Voice and writing rules

- Second person for player-facing intent ("the player can…"), present tense for systems.
- **Name the number.** "A short delay" is banned; "0.9 s" or "TBD-HYPOTHESIS" is required.
- Tables over paragraphs when comparing 3+ things.
- Any mechanic must answer: *what does the player press, what do they see, what changes,
  and what does it cost?* If a paragraph can't answer those four, it's mood, not design —
  move it to the narrative section.
- In-fiction proper nouns are capitalised and must exist in `glossary.md`.

---

## 6. Working rhythm (per session)

1. Read `02-systems/00-index.md` **status board** (30 seconds).
2. Pick the top `todo` task of the current phase (or the human picks it).
3. If the task needs a decision the docs don't contain: write a 1-page ADR *first*,
   propose it, then build. Never bury a design decision in a commit.
4. Build it. Make it playable in the browser.
5. Update: task state, the system spec's `updated` field, glossary if new nouns appeared.
6. Report: what's playable, what changed in the docs, what's the next task.

This is deliberately boring. Boring process is what lets a long project survive many
sessions of memory loss.

---

## 7. Reading order for a new collaborator

1. `00-pitch.md` — the fantasy in one page
2. `01-gdd.md` §1–3 — pillars and the shift loop
3. `02-systems/02-inspection-and-record.md` — the mechanical heart (the Record)
4. `06-research/00-index.md` §1 — the seven things prior art taught us
5. `03-production/phases/00-phase-index.md` — how work actually runs, phase by phase
6. `03-production/01-roadmap.md` — the one-line view and the cut list
7. `glossary.md` — the words

## 7a. Rule for borrowing from other games

We are an unashamed genre remix, so borrowing is normal — but it must leave a trail.

1. **Research before design** on any AI, simulation or content-selection system. Write findings in
   `06-research/`, including *what we rejected and why*.
2. **Every borrowed mechanism gets a verdict** in the adopted/rejected ledger
   (`06-research/00-index.md` §2). If it isn't in the ledger, it isn't a decision yet.
3. **A mechanic must justify itself against our thesis** ("the record is the world"), not against
   its source. "Because *Alien: Isolation* did it" is not a justification — see ADR-0003.
4. **Architecture choices get an ADR** (e.g. ADR-0004 for directors), because they're expensive
   to reverse.
5. **Legal check** on anything that resembles a patented system (see Nemesis boundary,
   `06-research/01-...§6`).
