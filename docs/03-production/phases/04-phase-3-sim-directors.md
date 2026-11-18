---
id: PH-3
title: "Phase 3 — Simulation, directors & content (7–10 sessions) — GATE G2"
status: review
owner: design
depends_on: [PH-2, SYS-SIM-01, SYS-DIR-01, SYS-STORY-01, ADR-0004]
consumed_by: [PH-4]
updated: 2026-11-18
---

# Phase 3 — Simulation, directors & content

**Phase thesis:** *the city should have opinions about you that you did not install.*

Architecture is already decided (`ADR-0004`); this phase is **implementation and authoring**, not
exploration. If a task here starts to need a new architecture, stop and write an ADR — that is a
signal, not a step.

---

## 1. Scope

**In:** 60 household records + the 12-Known cap; agent materialisation; temperature + grade +
barks; the storylet/deck runtime; the Desk's fault-line weighting; the Arbiter's 4-state pacing
FSM; the Cell's HTN-lite plans; Oversight Attention + the Eye's ladder; the AI score inspector;
60 micro-events; 80 directives with a contradiction graph; epilogue storylets.

**Out:** economy, rank, family, campaign structure, endings (Phase 4). Multiple sectors. OVERSEER.

---

## 2. Entry criteria

- [ ] **G1 passed**
- [ ] The Record has survived two phases without schema changes (if it hasn't, fix that first)
- [ ] `SYS-STORY-01` is specced as a *library* with no game-specific assumptions
- [ ] An authoring pipeline exists: JSON + `--validate` + a spreadsheet or a 1-screen editor

## 3. Exit criteria

- [ ] 6 shifts can be played back-to-back with a between-shift summary, no dead ends
- [ ] Adding a storylet JSON file changes behaviour with **no code change** (demonstrated live)
- [ ] Arbiter budgets hold for 50 simulated shifts (test)
- [ ] Oversight Attention rises and falls legibly; a tester can say *why* it changed
- [ ] A faction plan is discoverable via informants and preventable tactically
- [ ] A tester can name three citizens unprompted after 6 shifts (apophenia check)
- [ ] No director decision is untraceable in `debug:bus`

---

## 4. Task cards

### P3-T01 · Household records + per-shift tick
- **Why:** the population below the agents. Cheap, abstract, and the source of every consequence
  that doesn't need a body.
- **What:** 60 household records (block, members, ration class, housing, loyalty, secret, flags,
  grievance); a per-shift update function (< 15 ms); deterministic seeding per shift.
- **Acceptance:** 10 no-input shifts produce a coherent rising-tension history; tick < 15 ms;
  identical results on replay.
- **Not included:** materialisation (T02), factions (T05).
- **Cut candidate:** households to 40.

### P3-T02 · Agent materialisation + the 12-Known cap
- **Why:** the highest-value-per-line code in the project: continuity from a deterministic seed
  (`SYS-SIM-01` §4, research R-1).
- **What:** `materialise(household)` → agent (name, face seed, temperament, papers with possible
  real irregularity, knowledge, routine); the Known set with a 12-cap and eviction; the Registry
  UI showing known vs. record.
- **Acceptance:** the person you arrested on Monday appears as a named relative on Tuesday, with
  consistent papers; the Known set never exceeds 12; an eviction is *noticeable* (the roster
  shrinks visibly).
- **Not included:** relationship graphs beyond household membership.
- **Cut candidate:** none — this is the continuity trick the game's memory depends on.

### P3-T03 · Temperature, grade, barks
- **Why:** one scalar that the player reads like weather, not a meter (`SYS-SIM-01` §3).
- **What:** the formula; colour grade; ambient density (crowd size, emptiness); bark selection by
  band; the "next day" summary screen.
- **Acceptance:** testers can predict "the street is worse today" without a meter, from barks and
  colour alone (ask before showing the summary).
- **Not included:** weather, time-of-day lighting cycles.
- **Cut candidate:** the colour grade (keep barks) — cheap but the loss is real.

### P3-T04 · Storylet runtime (`SYS-STORY-01`)
- **Why:** the most reused non-Record code in the project: directors, micro-events, directives,
  family scenes and epilogues are all decks (`ADR-0004`).
- **What:** prerequisite predicate language (temperature ranges, flags, tags, shift windows,
  known-set state, faction antagonism); utility scoring hook; weighted sampling; effect application;
  epilogue scheduling with a timestamp; a `--trace` mode printing why a card was eligible.
- **Acceptance:** a new micro-event JSON appears in play within one shift without a rebuild;
  `--trace` explains a draw in one screen; the same seed draws the same cards.
- **Not included:** a visual node editor; hot reload (nice-to-have).
- **Cut candidate:** nothing. If this slips, T05/T10/T11/T12 all slip with it — it is the phase's
  spine.

### P3-T05 · Desk fault-line weighting
- **Why:** the Desk's whole purpose (`SYS-DIR-01` §6.1).
- **What:** the fault-line vector (brutality, leniency, honesty, corruption, family pressure,
  squad loyalty) updated from play; the scoring product (novelty × alignment × pacing ×
  temperature, with a 0.15 floor); a "probe the opposite" budget of one per 3 shifts.
- **Acceptance:** over 20 simulated shifts the deck measurably targets the player's top fault lines
  (log assertion); no archetype repeats within 3 shifts; the floor prevents starvation.
- **Not included:** surfacing the vector to the player (never).
- **Cut candidate:** the "probe the opposite" rule.

### P3-T06 · Arbiter pacing FSM
- **Why:** the *Left 4 Dead* lesson — pace with a small machine, fill with a big deck.
- **What:** calm/build/peak/release with the entry/exit conditions from the spec; hard budgets
  (≤2 armed incidents, ≥1 quiet scene, no repeat in 3, de-escalation offer above temp 70);
  a post-shift trace.
- **Acceptance:** budgets hold for 50 simulated shifts (test); a forced-peak shift still contains a
  quiet beat; the de-escalation offer appears whenever the threshold is crossed (test).
- **Not included:** difficulty presets (Phase 5 tuning).
- **Cut candidate:** the release state (peak → calm directly).

### P3-T07 · Oversight Attention + the Eye's ladder
- **Why:** research R-2. This is Act II's tension source, and the answer to "a panopticon is
  dramatically inert".
- **What:** the attention scalar (cameras, contradictions, proximity to cell activity, filing
  behaviour); 4 bands with distinct *world* feedback (radio density, drones, family enquiries);
  the Eye's escalation ladder (drone → checkpoint → forced audit); relief via honest filing.
- **Acceptance:** a player who files honestly and hits quota sees attention fall within 2 shifts;
  a tester can name why attention rose (from radio/world cues, not a number); high attention on a
  rival warden is achievable and has a visible consequence.
- **Not included:** weaponisation UI (an Act III content task, Phase 4).
- **Cut candidate:** the filing-behaviour term (the HYPOTHESIS flagged in the spec).

### P3-T08 · Cell HTN-lite plans
- **Why:** the insurgency must feel purposive and *discoverable* (`SYS-DIR-01` §7).
- **What:** 3–5 authored 3-step plans with preconditions, failure states, and a grudge-on-failure;
  informant intel that reveals the current step; prevention paths (burn the safehouse, arrest the
  recruit).
- **Acceptance:** a plan can be discovered by buying intel and prevented tactically, with the
  prevention visibly resetting the Cell's progress; failing to notice a plan produces a
  consequence that references it.
- **Not included:** plan-vs-plan interference, defection content.
- **Cut candidate:** plans to 3.

### P3-T09 · AI score inspector (dev overlay)
- **Why:** utility tuning without an inspector is guesswork (research §5, `02-npc-...`).
- **What:** hover an agent → candidate actions, axis values, curve outputs, final scores; hover a
  director output → candidate storylets and each factor.
- **Acceptance:** a designer changes a curve in JSON, reloads, and sees the behavioural delta in
  under a minute without touching code.
- **Not included:** a curve editor UI.
- **Cut candidate:** none — cheap and it pays for itself in the first tuning session.

### P3-T10 · 60 micro-events authored
- **Why:** the content that makes the Beat a place.
- **What:** 60 storylets, 30–90 s each, 2–4 resolutions mapping to report classifications;
  **≥40% referencing prior state** (connective-tissue budget).
- **Acceptance:** a shift's Beat has ≥3 distinct encounters; the connective-tissue ratio is
  measured by the validator (not estimated); no event is unplayable at temperature 0 or 100.
- **Not included:** voice, animation beyond a pose.
- **Cut candidate:** down to 30, with epilogues carrying the reuse (see the phase-index schedule
  break clause).

### P3-T11 · 80 directives + contradiction graph
- **Why:** the daily-vs-standing contradiction is the brief's "Papers, Please" pressure at the top
  of the loop.
- **What:** directive schema (type, text, quota, contradicts[], audit weight, reward, penalty);
  80 authored; a validator that refuses cycles and orphan contradictions.
- **Acceptance:** a daily directive can contradict a standing one and *both* are enforceable; the
  briefing surfaces the contradiction in-fiction without explaining it away; cycles are rejected.
- **Not included:** in-world legal texts beyond one line each.
- **Cut candidate:** 40 directives.

### P3-T12 · Epilogue storylets
- **Why:** delayed callbacks are how a silenced witness resurfaces and how 60 events feel like 200
  (research §5).
- **What:** scheduling on cause; the window (3–6 shifts); predicate on flags; surfacing in the
  docket or the Beat.
- **Acceptance:** a silenced witness resurfaces unprompted within the window; a protected family is
  referenced later; a tester says "that's the woman from the queue" without prompting.
- **Not included:** multi-epilogue chains (2-deep maximum, then stop).
- **Cut candidate:** windows beyond 1 hop.

---

## 5. Session plan (7–10)

| Session | Do | End state |
|---|---|---|
| A | T01 + T02 | a population that becomes people |
| B | T04 | decks that draw |
| C | T03 + T05 | weather and appetite |
| D | T06 + T07 | pacing and scrutiny |
| E | T08 + T09 | factions that scheme, tooling that explains |
| F–H | T10 + T11 + T12 | content volume |
| I–J (buffer) | tuning, G2 build | 6-shift playlist |

## 6. GATE G2 — *"Does the city feel alive and unfair in the right way?"*

Playlist: 6 shifts back-to-back, with the between-shift summary.

**Pass questions:**
1. **Aliveness:** does the tester describe an *unprompted* story about the sector (a person, a
   grudge, a rumour)? **PASS:** 2 of 3.
2. **Fairness:** when something bad happened, could the tester explain *why* (a directive, a
   faction, their own record)? **PASS:** 2 of 3. "The game just decided to punish me" is a fail
   (RISK R17).
3. **Apophenia check:** can they name three citizens unprompted? **PASS:** 2 of 3.

### If G2 fails — pre-committed ladder
1. **Aliveness fail:** raise the connective-tissue ratio to 60% and add 10 epilogues. Cheapest,
   highest-yield fix.
2. **Fairness fail:** the deck is opaque where it should be *purposeful*. Add the post-shift
   "what the Directorate noticed" summary and make directives foreshadow incidents explicitly.
3. **Apophenia fail:** the Known cap is too high or materialisation too rare. Lower the cap to 8
   and force a known-face appearance in every shift.
4. Still failing: cut a faction (the Congregation) and reduce the sector to 40 households — a
   smaller, better-known place beats a larger, anonymous one. Record as cut #1.

## 7. Cut line

Directives 80→40 → micro-events 60→30 → households 60→40 → drop the Congregation → drop the
release pacing state. **Never cut:** the storylet runtime, the Arbiter budgets, Oversight
Attention, the connective-tissue ratio, materialisation.

## 8. Gate result (fill in)

*Date · testers · three pass questions · named citizen quotes · decision · fixes · docs.*
