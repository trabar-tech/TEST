---
id: PH-INDEX
title: Phase Plans — index, session budget, gate protocols
status: review
owner: production
depends_on: [PROD-ROADMAP, PROD-METHOD]
consumed_by: [src/*, content/*]
updated: 2026-11-18
---

# Phase Plans

The roadmap (`01-roadmap.md`) holds the one-line view. **These files are the buildable version:**
per-phase scope, entry/exit criteria, task cards (why / what / acceptance / *not* included / cut
candidate), deliverables, and the playtest gate script.

| Phase | File | Sessions | Gate | The question it answers |
|---|---|---|---|---|
| 0 · Harness | `01-phase-0-harness.md` | 2–4 | — | can we even loop deterministically? — **done 2026-11-18** |
| 1 · The Record | `02-phase-1-record-slice.md` | 5–8 | **G0** | do I care about what I write? — **built 2026-11-18, gate pending** |
| 2 · Tactical | `03-phase-2-tactical.md` | 6–9 | **G1** | is the pause fun, and is the paper still the point? — **built 2026-11-18, gate pending** |
| 2b · Debt | `02b-phase-1-2-debt.md` | 1 | — | the G1 protocol, persistence, and the plan renderer — **done 2026-11-18** |
| 3 · Sim & directors | `04-phase-3-sim-directors.md` | 7–10 | **G2** | does the city feel alive and unfair in the right way? |
| 4 · Campaign | `05-phase-4-campaign.md` | 6–8 | **G3** | would I finish this twice? |
| 5 · Release | `06-phase-5-release.md` | 4–6 | — | does it run on a normal laptop? |
| 6 · OVERSEER | `07-phase-6-overseer.md` | 1 + 10–14 | **G4** | is attention scarcity tense? |

**Base game total: 30–45 sessions.** Expansion: 11–15 more, gated.

---

## 1. Standing rules for every phase

These are not repeated in each file. They apply always.

1. **A phase is not done until its playlist exists.** No phase closes without a build someone can
   play for the phase's stated duration without instructions.
2. **Entry criteria are real.** If Phase N-1's exit checklist isn't met, do not start Phase N —
   spend a session closing the debt instead. The order of phases is a risk-management decision,
   not a schedule.
3. **Every task ends in the browser** (except Phase 0's pure-core tasks, which end in a test
   output). No invisible work.
4. **Docs reconcile in the same session** as the work: task state, spec `updated:` field,
   glossary for new nouns, status board in `02-systems/00-index.md`.
5. **Cut before you slip.** Every task names what to cut instead. Cutting is recorded in the
   roadmap's Cut List, not silently absorbed.
6. **Timebox, then decide.** If a phase exceeds its upper session estimate by 50%, stop and make
   a decision (cut, descope, or extend) *in writing*. Silent overrun is how projects die.

---

## 2. Gate protocol (applies to G0–G4)

A gate is a **decision**, not a demo. Same script every time, so results are comparable.

### 2.1 Setup

| Item | Rule |
|---|---|
| Testers | **3 people** minimum. At least one who does not play tactics games. Zero who have read the docs. |
| Session | 15–25 min, recorded (screen + voice), **no designer narration**. |
| Build | The phase's playlist, on the browser build, on a machine you don't control. |
| Facilitation | You may answer only: "what does this button do" → "try it". Nothing else. |

### 2.2 Observation sheet (fill during, not after)

| Field | Why |
|---|---|
| Time to first meaningful action | is onboarding diegetic or absent? |
| Time on form / time on Beat | which half is the game, in their behaviour? |
| Did they read the exposure gutter before filing? | is the core loop legible? |
| First lie: shift, and *why they said they did it* | is Slack motivated or accidental? |
| Moments of hesitation > 20 s | where the design is ambiguous |
| Verbatim quotes about the fiction | does the tone land? |
| What they did after the shift ended | did they want another? |
| Can they explain what happened, in their own words? | is the system legible? |

### 2.3 Decision rule

Each gate has a **pass question** with a threshold. Write the outcome down before discussing:
`PASS` / `PASS WITH FIXES` (named, small) / `FAIL — do not proceed`.

**A FAIL is a success** if it happens early. The gates exist to prevent building Phase 3 on a
broken Phase 1, which is the single most expensive mistake available to this project.

### 2.4 After every gate

1. Write the gate result into the phase file (a short, dated section).
2. Update the risk register's "triggered risks" log with anything that fired.
3. Update the roadmap: task states, any cuts.
4. Only then plan the next phase's first session.

---

## 3. What "playlist" means per phase

The playlist is the smallest build that lets a stranger experience the phase's thesis.

| Phase | Playlist |
|---|---|
| 1 | one shift, 6 citizens, 5 filed lines, an audit, then a second shift that shows one consequence |
| 2 | one shift with two incidents: a quiet checkpoint and a flat breach — then the form |
| 3 | six shifts back-to-back, with a 90-second "next day" summary between them |
| 4 | the full 15-shift campaign, from a menu, with saves |
| 5 | the release build, played from a cold browser tab |
| 6 | three watch cycles from an imported save |

---

## 4. Critical path (why the order is what it is)

```
P0 ──▶ P1 (Record) ──G0──▶ P2 (tactical) ──G1──▶ P3 (sim/directors) ──G2──▶ P4 (campaign) ──G3──▶ P5
                                        │                                        │
                                        └───── both feed the Record ────────────┘
                                                                                 ▼
                                                                          P6 (OVERSEER) ──G4
```

- **P1 before P2** because the Record is the thesis, and because the tactical layer's *output* is
  a report line. Building tactics first means inventing the report shape from the tactics side,
  which produces the wrong abstraction (and then OVERSEER is a rewrite).
- **P3 after P2** because directors need something to direct. A deck with no scenes is a
  spreadsheet.
- **P4 last** because economy and campaign are *tuning surfaces*: they need the systems beneath
  them to be stable enough that numbers mean something.
- **P5 short** because a web build is cheap to polish, and because polish that happens before the
  content is final is wasted.

---

## 5. Where the schedule will actually break (pre-committed responses)

| Breaks at | Symptom | Pre-committed response |
|---|---|---|
| P1 overruns | the form isn't fun after 3 iterations | **Stop.** Cut to 3 decisions per line (classification, force, free text) and re-test. Do not add features to fix it. |
| P2 overruns | squad orders feel fiddly | Cut squads entirely from v1.0; ship solitaire (Focus + pause). Recorded cut #4. |
| P3 overruns | content authoring is the bottleneck | Halve micro-events to 30; rely on epilogue callbacks to reuse them. Cuts run length, not systems. |
| P4 overruns | campaign tuning won't converge | Ship 10 shifts, not 15 (cut #5). Keep Continuing Service. |
| G4 fails | attention economy isn't tense | Cut the expansion. Spend the sessions on Continuing Service + New Game+. |
