---
id: PROD-ROADMAP
title: Roadmap — Phases, Tasks, Acceptance Checks, Cut List
status: review
owner: production
depends_on: [PROD-METHOD, SYS-INDEX]
consumed_by: [src/*]
updated: 2026-11-18
---

# Roadmap

**7 phases.** Each ends in a **playable** and (from Phase 1) a **gate**. Phases 0–4 are the
project; 5 is polish/release; 6 is the expansion, gated by a prototype.

> **This file is the one-line view. The buildable version is in `phases/`** — per-phase scope,
> entry/exit criteria, task cards (why / what / acceptance / not-included / cut candidate),
> session plans, gate scripts with pass thresholds and pre-committed failure ladders.
> Start at `phases/00-phase-index.md`.

| Phase | Detail | Sessions | Gate |
|---|---|---|---|
| 0 | `phases/01-phase-0-harness.md` | 2–4 | — |
| 1 | `phases/02-phase-1-record-slice.md` | 5–8 | G0 |
| 2 | `phases/03-phase-2-tactical.md` | 6–9 | G1 |
| 3 | `phases/04-phase-3-sim-directors.md` | 7–10 | G2 |
| 4 | `phases/05-phase-4-campaign.md` | 6–8 | G3 |
| 5 | `phases/06-phase-5-release.md` | 4–6 | — |
| 6 | `phases/07-phase-6-overseer.md` | 1 + 10–14 | G4 |

**Total: 30–45 sessions for the base game**, 11–15 more for the expansion.

Legend: `[ ]` todo · `[~]` in progress · `[p]` playable · `[v]` verified · `[x]` cut

---

## Phase 0 — Harness (2–4 sessions)

Goal: a browser window that runs a deterministic tick loop and draws a top-down sector.
No gameplay. This is the phase that gets skipped and shouldn't be.

**Status: complete 2026-11-18 (1 session).** Invariants live in
[`phases/01-phase-0-harness.md`](phases/01-phase-0-harness.md); proof lives in `tests/`.

| ID | Task | Acceptance check |
|---|---|---|
| `[v]` P0-T01 | Vite + TS + WebGL2 renderer skeleton; 0.0.0.0 bind, single HTML entry | page loads at preview URL, 60 fps empty grid |
| `[v]` P0-T02 | Fixed-timestep clock (60 Hz sim, interpolated render) + seedable RNG | replaying seed 42 twice yields identical state hash |
| `[v]` P0-T03 | ECS-lite entity store + event bus + `debug:bus` overlay | every system message visible in the overlay |
| `[v]` P0-T04 | Save/load to IndexedDB, versioned envelope | save → reload → state hash matches |
| `[v]` P0-T05 | Tilemap + navmesh + A* click-to-move for one pawn | click anywhere walkable, pawn paths around a wall; 40 paths < 2 ms |
| `[v]` P0-T06 | Timescale engine (1.0 / 0.15 / 0.35 / 0.0) with a debug slider | slider changes sim rate, render stays smooth |
| `[v]` P0-T07 | Content loader for `content/*.json` with schema validation | malformed JSON fails loudly with a file+field message |

**Cut candidates:** P0-T03's overlay (keep the bus, drop the UI), P0-T04 (defer to Phase 1).

---

## Phase 1 — The Record vertical slice (5–8 sessions) ← **the most important phase**

Goal: **one full shift** in grey boxes: walk, inspect 6 citizens, trigger 1 micro-event, file a
form, get an audit. Then a human plays it and answers G0.

**Status: built 2026-11-18.** G0 not yet run — three untrained testers are required, and that is
not something the build can supply. Micro-events are authored but not yet drawn (Phase 3).

| ID | Task | Acceptance check |
|---|---|---|
| `[v]` P1-T01 | `ReportLine` schema + event log + serialisation (ADR-0002 shapes) | a hardcoded event → line → save round-trip, unit-tested |
| `[v]` P1-T02 | Beat mode: pawn walking, 6 citizens with routines, hover/interact | can walk the block, citizens keep 1 routine each |
| `[v]` P1-T03 | Citizen card UI: 6 fields, 3 checks, generated irregularities | a citizen with a bad serial is visually distinguishable via checks |
| `[v]` P1-T04 | Inspection conversation: temperament + 3 questions + outcome | catching a rehearsed liar feels *reasoned*, not pixel-hunted (playtest) |
| `[v]` P1-T05 | Desk form UI (1 page): stamps, steppers, tags, free text, exposure gutter | filing 5 lines takes < 90 s decisively; exposure always explainable |
| `[v]` P1-T06 | Audit engine: contradiction + witness + peer tests → stamped sheet | camera-observed lie is caught 100%; honest filing never surprises |
| `[v]` P1-T07 | `SectorBelief` write + a single visible consequence next shift | under-reporting resistance changes the next day's incident text |
| `[v]` P1-T08 | **Grey-box art pass + barks** (30 lines) so the slice can be *felt* | a tester can describe the regime's tone from the slice alone |

**Gate G0:** *"Do I care about what I write?"* — 3 testers, 15 min each.
**If fail:** do not start Phase 2. Redesign the Record; the GDD's §3.2 becomes the only doc that
matters.

**Cut candidates:** free text (ship tags-only), the third inspection question.

---

## Phase 2 — Tactical layer (6–9 sessions)

Goal: a breach scene that is tense, legible, and *generates a report line you'd rather lie about*.
Gate G1.

| ID | Task | Acceptance check |
|---|---|---|
| `[v]` P2-T01 | Door state machine + 8 entry types + noise events | each entry produces the documented noise radius in the log |
| `[v]` P2-T02 | Information gating: silhouettes, ~~sound pings~~, ~~camera feed~~ | you cannot see room contents without a source |
| `[v]` P2-T03 | Solo **Focus** mode (0.35×, 6 s / 9 s) | exposure cut 65%; criterion restated — see phase doc §4b |
| `[v]` P2-T04 | Order queue (8 verbs, 4 deep) + squad AI literal execution | stack→ram→clear executes unattended; contact cancels queue (no drag-reorder) |
| `[v]` P2-T05 | Force continuum: 5 rungs, authorisation radio, wound model | every rung-2+ action writes exactly 1 line with the correct tool tag |
| `[v]` P2-T06 | Force ratchet: `force_index` raises next shift's starting rung | tested in-session; save persistence is Phase 3 |
| `[v]` P2-T07 | Crowd mood graph (12→40 agents), heat band | 34 agents at 0.075 µs/tick; no ground ring yet |
| `[v]` P2-T08 | Incident → report integration ("clear is a claim") | a mis-cleared room creates a wrong line that an audit can blow open |
| `[v]` P2-T09 | Squad comms: hotkey orders, voice ack, **Flow** bonus | 3 orders in 5 s unpaused grants Flow; paused orders lag 0.4 s |

**Phase 2b (debt):** `[v]` G1 playlist harness · `[v]` sector/force persistence · `[v]` plan
renderer · `[v]` crowd ring · `[v]` queue reorder — see `phases/02b-phase-1-2-debt.md`.

**Gate G1:** *"Is the pause/slow-mo fun — and is the paperwork still the point?"*
**If fail:** cut one of {Focus, Pause} and rebalance; do not add systems.

---

## Phase 3 — Simulation, directors, campaign shape (7–10 sessions)

Goal: 6 shifts that feel like a place with a memory. Gate G2.
**Architecture is decided (ADR-0004); this phase is implementation + content, not exploration.**

| ID | Task | Acceptance check |
|---|---|---|
| `[x]` P3-T01 | Household records (60) + per-shift sim tick < 15 ms | 10 no-input shifts produce a coherent rising-tension history | *60 households generate from a seed; temperature/legitimacy/grade tested. Per-shift tick budget not yet profiled.*
| `[x]` P3-T02 | Agent **materialisation** from households (deterministic) + **12-Known cap** | a person you arrested appears as a named relative later; Known set never exceeds 12 | *`materialise()` is pure — the same household is the same person across shifts. Known cap 12, eviction tested. Forced reappearance not yet wired.*
| `[x]` P3-T03 | Temperature formula + colour grade + barks driven by it | players can predict "the street is worse today" without a meter | *formula + grade tested; every other ambient line is now a graded bark off the saved sector memory (`mood.ts`). The street reads the tactical ratchet, not the campaign formula — they merge when the showrunner goes live*
| `[x]` P3-T04 | The **Cell** plan engine (HTN-lite: 3–5 authored 3-step plans) | a plan can be discovered by informants and prevented tactically | *Cell `advancePlan` procure→recruit→strike, read by informants, with grudges as records*
| `[x]` P3-T05 | **Storylet deck runtime**: prereqs, utility scoring, weighted draw | adding a storylet JSON file changes behaviour with no code change | *`src/systems/storylets.ts`; content changes behaviour with no code change (proved by `tests/phase3-content.test.ts`)*
| `[x]` P3-T06 | The **Desk** fault-line weighting over the deck | the deck measurably targets the player's highest fault lines (log assertion) | *fault vector with 0.85 decay; directives explain themselves in the Desk's words*
| `[x]` P3-T07 | The **Arbiter** 4-state pacing FSM + hard budgets | budgets hold for 50 simulated shifts; no black-box decisions | *4 states, budgets, RELEASE outranks all; state persists across shifts*
| `[~]` P3-T08 | **Oversight Attention** gauge + Eye escalation ladder | honest filing lowers attention within 2 shifts; the player can name why | *gauge + ladder done; "honest filing lowers attention" is decay-only, not yet tied to filing honesty*
| `[x]` P3-T09 | **AI score inspector** (dev overlay: candidate actions, axes, scores) | a designer can tune a curve in JSON and see the delta without a rebuild | *player-facing Inspector, not a dev overlay: the same arithmetic the director used, plus ruled-out cards*
| `[~]` P3-T10 | 60 micro-events authored as storylets + weighted | a shift's Beat has ≥3 distinct encounters; ≥40% reference prior state | *12 storylets, not 60 — a representative slice (cut line permits 30)*
| `[~]` P3-T11 | Directive system with contradiction graph (80 directives) | a daily directive can contradict a standing one and both are enforceable | *22 directives, not 80. Contradictions are **now enforced**: charged on the audit sheet, warned in the desk before signing, and issued live in the browser. Quotas still unmeasured*
| `[x]` P3-T12 | **Epilogue storylets** (delayed callbacks, 3–6 shifts) | a silenced witness resurfaces unprompted; a protected family is referenced later | *epilogue chain: me-03 → epi-01, me-05 → epi-02, scheduled 2–6 shifts ahead*

**Status (as built):** the spine is real and the district is real; the *content volume* is the
gap (12 storylets, 22 directives) and it is the gap the cut line prefers. Barks are not yet
driven by grade, and the showrunner is not yet wired into the browser's shift loop — both
deliberately, because both are decisions a G2 session should inform. See
`phases/05-phase-3-as-built.md`.

**Gate G2:** *"Does the city feel alive and unfair in the right way?"* Also ask: *"Can you name
three citizens?"* (apophenia check — research R-1). **NOT RUN** — no human has played this.
**If fail:** cut one faction (the Congregation is the easiest cut), keep the Cell + Eye.

**New dependency:** P3-T05 (deck runtime) must land before P3-T06, T10, T11 and T12. It is the
single most reused piece of code in the project after the Record — build it as a library, not a
system.

---

## Phase 4 — Economy, family, campaign, endings (6–8 sessions)

| ID | Task | Acceptance check |
|---|---|---|
| `[ ]` P4-T01 | Rank/quota/perk/requisition systems | promotion always adds a verb, never just a number |
| `[ ]` P4-T02 | Household ledger, debt tree, Syndicate thread | negative FP recoverable within 2 shifts via ≥1 path |
| `[ ]` P4-T03 | Family scenes (reactive, not nagging) | every family scene references *today's* events |
| `[ ]` P4-T04 | 15-shift campaign structure + act transitions | can be played start to finish with no dead ends |
| `[ ]` P4-T05 | 5 endings + the Case File browser (searchable archive) | endings determined by data; verified by test, not by eyeball |
| `[ ]` P4-T06 | Compliance Review modifier + purge/hard-fail rules | 3 reviews in a row ends the run, with a legible reason |
| `[ ]` P4-T07 | Act III politics: denounce a rival warden using your own archive | a stable, corroborated line succeeds; an unstable one backfires *predictably* |

**Gate G3:** *"Would I finish this twice?"*
**If fail:** cut campaign to 10 shifts; keep Continuing Service as the long tail.

---

## Phase 5 — Polish, performance, release (4–6 sessions)

| ID | Task | Acceptance check |
|---|---|---|
| `[ ]` P5-T01 | Performance pass: draw calls, atlas, object pools | 60 fps @1080p, integrated GPU; < 250 MB payload |
| `[ ]` P5-T02 | Accessibility: keyboard-only Desk, 125% font, colourblind coding | full playthrough without a mouse on the Desk |
| `[ ]` P5-T03 | Onboarding: diegetic tutorial (a superior walks you through shift 1) | first honest report filed in < 2 min, no manual |
| `[ ]` P5-T04 | Audio pass: ducking during inspections, radio barks | inspection silence is audible (test: mute music check) |
| `[ ]` P5-T05 | Save migration + "New Game+ Known Quantity" | previous Case File read aloud as evidence |
| `[ ]` P5-T06 | Continuing Service (endless mode) after the campaign | 20 procedural shifts with Arbiter budgets still holding |
| `[ ]` P5-T07 | Release build, hosting, crash-free session log | 30-min session, no console errors |

**Release:** browser build (static host), 1.0.

---

## Phase 6 — *OVERSEER* expansion (gated, 10–14 sessions)

**Gate G4 first:** `[ ]` P6-T01 **Frozen watch-cycle prototype** — one sector, 3 feeds, 2 squads,
4 anomaly pins, no art, 20 minutes. *"Is the attention economy tense?"*
If no → expansion is cut and the time goes into Continuing Service. Record the decision.

| ID | Task | Acceptance check |
|---|---|---|
| `[ ]` P6-T02 | Headless tactical resolution (simulate a dispatched scene in < 2 s) | squad dispatch resolves without rendering |
| `[ ]` P6-T03 | City map layer + camera tasking + 3-feed attention cap | neglect is attributable in the after-action report |
| `[ ]` P6-T04 | Anomaly triage with source-credibility from the Case File | a lying warden's reports are measurably less credible |
| `[ ]` P6-T05 | Audit tool (raises compliance, degrades that squad's report quality) | the trade is measurable within 3 cycles |
| `[ ]` P6-T06 | Macro levers: curfew, ration cut, sweep, amnesty (reversible ratchets) | amnesty can walk a ratchet back down over 2 cycles |
| `[ ]` P6-T07 | Case File import as ground truth (defend your old lies) | a base-game lie surfaces as an Act II obligation |
| `[ ]` P6-T08 | Manual control bridge with Micromanagement flag | manual control never strictly optimal across 3 uses |
| `[ ]` P6-T09 | Act III self-inquiry in the Night Desk UI + 4 endings | all 4 endings reachable purely from accumulated data |

---

## Cut List (recorded, not shameful)

Pre-authorised cuts, in the order they'd be taken if the schedule slips:

| # | Cut | Cost | When it's acceptable |
|---|---|---|---|
| 1 | The Congregation faction | loses religious-community texture | any slip |
| 2 | Free-text on reports (tags only) | loses the best lines, keeps mechanics | if localisation or typing is a burden |
| 3 | Crowds >20 agents | Act II loses scale, keeps choice | if perf fails at G2 |
| 4 | Squad >1 officer | weakens the Door-Kickers layer; Focus carries it | if P2-T04 slips |
| 5 | Campaign from 15 → 10 shifts | tighter pacing, fewer directives | G3 fail |
| 6 | OVERSEER expansion | the game is complete without it | any time; it's post-1.0 |
| 7 | Metre-perfect art (goes abstract) | cheaper, more legible, less atmospheric | if art pipeline stalls |

**Not cuttable (project-killing if removed):** the Record, the audit, the exposure gutter, the
force ratchet, the quota/temperature spiral.

---

## Critical path

```
P0 harness ──▶ P1 RECORD ──[G0]──▶ P2 tactical ──[G1]──▶ P3 sim/directors
                   │                                          │
                   └──────────── feeds SectorBelief ───────────┘
                                                                  ▼
                                                          P4 econ/campaign ──[G3]──▶ P5 release
                                                                                       │
                                                                              P6 OVERSEER [G4]
```

The single riskiest dependency: **P1 must not be shortened.** Everything either feeds the Record
or reads it. A weak Record makes every later system decorative.
