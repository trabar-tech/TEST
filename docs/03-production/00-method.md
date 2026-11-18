---
id: PROD-METHOD
title: How We Actually Build This (and whether the plan is good)
status: approved
owner: production
depends_on: [README, PITCH-01]
consumed_by: [01-roadmap]
updated: 2026-11-18
---

# Method — docs → game, in phases and tasks

## 0. Your question, answered plainly

> *"Is this a good way to make this — docs system first, then the game in phases of tasks?"*

**Yes, with three corrections.** The instinct is right and it's a big step up from "one prompt →
full game". But the naive version of it fails in specific, predictable ways.

### What's right about it

| Your instinct | Why it works |
|---|---|
| Write the design down before building | An agent's memory resets between sessions; the repo is the only durable mind. Docs are how a 9-month project survives being interrupted 200 times. |
| Split into phases | Phases let you *stop* at a coherent point and still have something shippable. One-prompt builds produce a demo that dies on contact with the second feature. |
| Split phases into tasks | Tasks are the unit of *verification*. A task has one unknown, so when it breaks you know what broke. |
| Docs before the game | Prevents the classic failure: 6 systems half-built and nothing playable. |

### The three corrections (these are the difference between this working and not)

**Correction 1 — Slices, not layers.**
The naive reading of "phases of tasks" is *system-by-system*: build inspection fully, then combat
fully, then economy. That produces **nothing playable for months** and, worse, defers the only
question that matters: *does the Record feel good?*

So every phase here is a **vertical slice with a playable check at the end**, and the riskiest
system is built **first and crudest**. Phase 1 is not "the inspection system" — it is *one shift
that ends with a form, in a grey box, that is fun for 10 minutes.* If that isn't fun, the entire
GDD is wrong and we find out in week 2 instead of month 5.

**Correction 2 — The docs must be allowed to die.**
A "documentation system" that only grows becomes a liability: the agent reads stale docs and
confidently builds the wrong thing. So: every doc has `status` and `updated`; `implemented`
specs get *shrunk* to their invariants; `deprecated` docs stay but never get read as truth. And
the **build always wins over the doc**, with an obligation to reconcile in the same session.

**Correction 3 — Each task needs an acceptance check a stranger can run.**
"Implement inspections" is not a task, it's a wish. `P1-T04 · inspection card with 6 fields and
3 questions; passes when a citizen with a bad chip serial can be caught in under 15 seconds and
the result writes exactly one report line` — that's a task. Without the checkable clause, phases
turn into a long list of things that are "basically done".

### What this process will *not* do

- It will not tell you if the fantasy lands. **Only a playable will.** Hence the go/no-go gates.
- It will not survive feature creep unless the Cut List is real. Every phase has one, and cutting
  is a recorded success, not a failure.
- It will not replace a human decision-maker for taste calls. The docs frame the decision; the
  human calls it. Which is why every open question is written as an open question with options.

### Verdict

**Do this: docs → phase 0 (harness) → phase 1 (the Record vertical slice) → go/no-go → continue.**
Refuse to do this: docs → "now build the game". And resist the temptation to make the docs
*bigger*; the value is in the constraints, not the page count. If a section of this GDD is never
consulted during Phase 1–2, it's either wrong or premature, and it should be cut.

---

## 1. The three doc tiers (and their lifespans)

| Tier | Files | Lifespan | Written by | Must answer |
|---|---|---|---|---|
| **Vision** | `00-pitch.md`, `01-gdd.md` §1–2 | whole project, edited rarely | design + human | what is this and why would anyone play it |
| **System specs** | `02-systems/*` | until implemented, then shrunk | design | what does the player press, see, get, pay |
| **Production** | `03-production/*`, ADRs | continuously updated | production | what's next, what's cut, what's risky |

Anti-pattern to avoid: a *fourth* tier ("design notes", "random ideas", "brainstorm.md"). If an
idea isn't durable, it belongs in a task comment or a scratch file that gets deleted.

---

## 2. The session protocol (the thing that makes memory loss survivable)

Every work session follows this, and each step is cheap:

```
1. READ     docs/02-systems/00-index.md  (status board, 30 s)
2. DECIDE   top todo task, OR if the task needs a decision → write an ADR first
3. BUILD    smallest change that makes the task's acceptance check runnable
4. PLAY     run it in the browser; if it isn't playable, the task isn't done
5. RECONCILE  update task state, spec `updated:` field, glossary, and the status board
6. REPORT   "playable: X · docs changed: Y · next: Z"
```

**Why step 2's ADR-first rule matters:** design decisions buried in code get silently re-decided
by the next session. An ADR is 1 page and takes 10 minutes; a re-litigated decision costs days.

---

## 3. Task sizing rules

| Rule | Rationale |
|---|---|
| 0.5–2 sessions per task | longer = the acceptance check becomes fuzzy |
| **one** unknown per task | otherwise a failure can't be attributed |
| every task ends in something visible in the browser | no invisible tasks in a playable-first project |
| tasks may depend on ≤ 2 others | more = the phase is mis-sequenced |
| a task that requires a doc change writes that change in the same session | prevents drift |

Task states: `todo → in-progress → playable → verified → cut`.

`playable` means the acceptance check can be run. `verified` means someone else (or a fresh
session) ran it and it passed. `cut` requires a one-line reason in the roadmap.

---

## 4. Playtest cadence (cheap, frequent, humiliating)

| Gate | When | Build | The question | If it fails |
|---|---|---|---|---|
| **G0** | end of Phase 1 | grey boxes, 1 shift, the form | *Do I care about what I write?* | redesign the Record — do not build Phase 2 |
| **G1** | end of Phase 2 | 3 shifts, tactical layer | *Is the pause/slow-mo fun, and is the paper still the point?* | cut a mode (Focus or Pause) and re-decide |
| **G2** | end of Phase 3 | 6 shifts, full sim | *Does the city feel alive and unfair in the right way?* | tune temperature/directors; cut a faction |
| **G3** | end of Phase 4 | 15 shifts | *Would I finish this twice?* | cut campaign length to 10 shifts |

**Testers:** 3–5 people, all outside the project, one of whom has never played a tactics game
(they are your readability check). Sessions recorded; **no verbal explanation** from the
designer during the session. If something needs explaining, it's a design bug.

Metrics per gate (all cheap to log in a web build):
`time_to_first_lie`, `lies/shift`, `quickloads/shift`, `seconds_on_form`, `abandoned_form_fields`,
`force_rung_histogram`, `faction_heat_curve`, `did_they_read_the_case_file`.

---

## 5. Content pipeline

All content is JSON in `content/`. Authored in a spreadsheet or a small editor, never in code.

```
content/
├─ citizens/      archetypes + name tables + paper-irregularity weights
├─ inspections/   card templates, question pools, temperaments
├─ incidents/     archetypes, params, difficulty bands, fault-line tags
├─ maps/          tile JSON + navmesh + door/light/camera declarations
├─ directives/    daily + standing, with contradiction graph
├─ household/     nightly needs tables, family scenes
└─ text/          barks, radio lines, notices (one file, keyed, localisation-ready)
```

**Content budget (v1.0):** 60 households, 60 micro-events, 24 incident archetypes, 5 maps,
80 directives, ~1200 text lines. That is a *small* game by content volume and a large one by
system depth — which is the correct shape for a web-first, docs-driven project.

---

## 6. Definition of Done (project-level, not task-level)

A release is done when all of these are true:

- [ ] 15 shifts can be played start to finish with no blocking bugs
- [ ] All 5 endings reachable; ending determined by data, verified by test
- [ ] 60 fps at 1080p on reference hardware (integrated GPU), < 250 MB initial payload
- [ ] First 10 minutes teach inspection, filing, and the exposure gutter without a text wall
- [ ] Full keyboard-only path through the Desk; font scale 125% works
- [ ] Save/load round-trips a campaign with a 400-line Case File
- [ ] No doc in `02-systems/` is `draft` unless the feature is `cut`
- [ ] A player who never reads the manual can file their first honest report in < 2 min

---

## 7. Anti-patterns we commit to avoiding

1. **"We'll fix the fantasy later."** No — the fantasy is the product.
2. **Systems without a verb.** If a design element doesn't add a button, a line of text, or a
   consequence the player can see, it's mood, and mood goes in text, not code.
3. **The ever-growing GDD.** Docs get shorter as the game grows.
4. **Silent re-design.** Any change to a documented number goes back into the doc in the same
   session, or it didn't happen.
5. **Building the expansion early.** OVERSEER's only obligation is *five architectural rules*
   (see `05-overwatch-expansion.md` §7). Nothing else gets built for it before 1.0.
