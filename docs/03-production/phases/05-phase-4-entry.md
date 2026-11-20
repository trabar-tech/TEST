---
id: PH-4-ENTRY
title: "Phase 4 entry work — the headless campaign runner and what it found"
status: review
owner: design
depends_on: [PH-3, PH-4]
consumed_by: [PH-4]
updated: 2026-11-18
---

# Phase 4 entry work

Phase 4 (`05-phase-4-campaign.md` §2) lists three entry criteria, and one of them is a
tool rather than a feature:

> A headless campaign runner exists (simulate 15 shifts without rendering) — *this is the
> single most valuable tool of the phase; build it first if it doesn't*

It did not exist. It does now, and it immediately paid for itself by falsifying two things
this repository believed.

**G2 has still not been run.** This document records *entry* work toward Phase 4, not a
phase transition. Nothing here is a substitute for three human testers.

---

## 1. What was built

| Piece | Where | Why it is shared |
|---|---|---|
| `runCampaign()` | `src/systems/campaign.ts` | drives the real `Simulation`, the real audit, the real deck and the real `advanceShift()` |
| `advanceShift()` / `ordersForShift()` | `src/systems/shift-cycle.ts` | the browser and the runner call the *same* shift boundary |
| `npm run campaign` | `scripts/campaign.ts` | a tuning change gets a before/after instead of a vibe |
| Four policies | `POLICIES` | each is a legible player shape the design worries about |
| 17 tests | `tests/campaign.test.ts` | determinism, divergence, and "the tool measures the game" |
| `tuning.json` + `sweep` | `content/tuning.json`, `src/core/tuning.ts`, `scripts/sweep.ts` | 12 tests; one dial at a time, before/after instead of opinion |

The critical design rule: **the runner must not re-implement the game.** `main.ts` used to
own the shift boundary — age the record, clear the docket, advance the sector, decay
grudges, re-draw orders — which meant any simulation that did not copy that sequence would
measure a different game than the one people play. That sequence is now `advanceShift()`,
and both callers use it. This is the third instance of the same bug class in the project
(the others are recorded in `AGENTS.md`): *ordering that lives in a caller is ordering
that will eventually be wrong in one of them.*

Policies make decisions through an object (`chooseResolution`, `incidentClaim`,
`inspectionsPerShift`, `inspectionOutcome`) rather than replaying a script, because a
runner that replays a recorded script measures the script.

---

## 2. What it found in its first hour

### 2a. The district reaction never saw auto-filed lines

The same bug fixed in the browser one session earlier was reproduced in the runner, which
is exactly what a shared tool is for. `submit()` writes the lines a player did not; reacting
to the record *before* it meant every absent player was under-charged. Now handled by
`includeAutoFiled()`.

The instructive part is that the browser fix did not *prevent* the runner bug — the runner
was written by copying the shape of the browser call, and copied the shape of the call at
the wrong moment. The durable fix is not a comment; it is that the act-collection logic
should move into `shift-cycle.ts` too. Recorded here as the next refactor rather than
pretending it is done.

### 2b. `harden()` promoted on a single crossing, and took a block with it

`docs` and code comments describe grievance as hardening "slowly" into a state a faction
can use. The code promoted a household to `available` the first time it read ≥ 0.7.
Because a single refusal also raises every household in the same block by the neighbour
share, one line produced **six available households in a single night**.

Measured, with the runner:

```
before: 0 available
one refusal (claim R) at h-004 → after: 6 available (h-028 … h-044)
```

Fixed by `TURN_SHIFTS = 3`: a household must spend three consecutive shifts above the line,
and a household that cools off loses the streak, so grievance has to be *sustained* to
become a state. A refusal now costs grief, as the reaction table intended, and the Cell's
recruitment step has something gradual to work on.

This is a design-level correction, not a numeric tune, which is why it was made rather than
logged: the pre-committed ladder for a G2 apophenia failure says to lower the Known cap and
force appearances, and neither of those would have helped while twenty-five percent of the
district could turn in one evening.

### 2c. The district is, in practice, six households wide

The recursion deck draws its household from the Known list, and the Known list is fed by
filings. The runner files three inspections a shift and is capped at six Known, so *every*
raid in a fifteen-shift run happens in the same six households (and their blocks). The
other fifty-four households in the sector are scenery.

This is a real finding, and it connects to a claim made in `04b` §2f: recurrence now closes
the loop from filing to raid. It closes it **inside a six-household ring**. Whether that is
a problem is a playtest question (a small cast of recurring names may be exactly right —
G2's apophenia check wants the player to name three citizens, not thirty), but it is now a
measured fact rather than an assumption, and it should be the first thing looked at when
Phase 4 tunes the campaign.

### 2d. Temperature does not move

Across forty runs of fifteen shifts, the sector temperature moves by ~1 point
(31 → 30 or 31 → 34). The causes are structural, not numeric:

- `legitimacy()` is dominated by `loyalty`, and `grievancePressure` contributes at most 12
  of 100;
- nothing in the campaign loop advances `force_index`, `supply_deficit` or `faction_heat`,
  so three of the four temperature terms are constants in a headless run;
- the mean grievance is *structurally* ~0.5 by generation (mean 0.503), which pins
  legitimacy at roughly 47 and therefore temperature in the low thirties.

So "the city feels alive" currently has no number that changes. The remedy belongs in
Phase 4 with the economy (rent, ration points and rank are what should move
`supply_deficit` and `force_index`), not in a tweak to the weight table — tuning weights
against constant inputs would produce a curve that looks tuned and measures nothing.

---

## 3. Deliberate limits of the runner

Stated here because a tool that hides its scope is worse than no tool:

- **Incidents are resolved through the docket path, not the tactical scene.** A raid is not
  simulated. The runner measures the paperwork loop, the audit and the district.
- **No conversation content.** Inspections are opened and resolved without asking the three
  questions; the transcript is a playtest question, not a tuning one.
- **No family, no ledger, no rank.** Those are Phase 4 features; the runner is the harness
  they will be tuned against.
- **Endings are placeholders.** `removed from post`, `the sector is lost` and `the Cell owns
  the block` are working conditions, not the five authored endings of P4-T05.

---

## 4. The household ledger is built, and its numbers do not reconcile

`src/systems/economy.ts` implements `SYS-ECON-01` §6: four lines (hard cap, enforced), a
wage, the −60 debt floor as a scene rather than a fail state, promotion gating, and one
narrow channel from the personal purse to the district's supply. Seventeen tests.

It is **not wired into the campaign loop**, and that is deliberate. Measure the spec against
itself:

| rank | wage | bill (rent 30 + food 22 + medicine 15) | night's balance | lines paid |
|---|---|---|---|---|
| 1 | 10 | 67 | −57 | none |
| 3 | 14 | 67 | −53 | none |
| 5 | 18 | 67 | −49 | none |

- `§3` gives `wage = 8 + rank × 2` → **10 FP at rank 1**.
- `§3`'s own table gives `Wage 10 … 21` → **21 FP at rank 5**.
- `§6.1` gives a nightly bill of **67 FP**.

So: the two wage statements disagree with each other, and *both* are far below the bill.
Every rank is insolvent on night one, and a **single** missed night (67) exceeds the −60
debt floor, which makes "debt allowed to −60" meaningless.

The "a player who never lies can afford rent in Act I and *barely* in Act II (~30% failure
in Act II)" curve that `§8` asks for has no range to live in at these numbers — Act I is
already impossible. This cannot be resolved in code; it is a design decision, and picking a
number here would have hidden it behind a green test. `insolvencyGap()` and one test exist
specifically to keep the contradiction visible until it is decided.

**Three candidate fixes, in the order I would argue for them:**

1. **Lower the bill** (`SYS-ECON-01`'s own second principle is that *rent* is the number
   players feel — 72 FP was quoted for the flat). A rank-1 Warden needs a bill around 8–12
   FP just to break even on the spec's wage, which suggests the bill is meant in *hundredths*
   or the wage in another unit. Picking a scale is the cheapest fix and needs no new content.
2. **Raise the wage** to roughly 3–4× the table. Cheap, but then rent is never scary and the
   "cannot out-skill" pressure disappears.
3. **Make the wage quota-conditional** (the spec already says "+2 if quota met"), so the
   real curve is *income variance*, not level. Most interesting, most work, and the only one
   that makes the campaign runner's temperature curve do anything.

**Recommendation: do 3, but stage it as 1 → 3.** Fix the scale first (so the ledger is
solvent at all), then move surplus into quota performance, then sweep with `npm run campaign`
looking for a ~30% Act II failure rate.

## 5. One tuning surface, and the sweep that proved itself useless first

`content/tuning.json` now holds every number that changes how the game feels: economy, district,
recurrence, storylet counts, scene pacing. `src/core/tuning.ts` is the only module allowed to
hold a default, validates loudly with field names, and freezes the result so a system cannot
tune itself mid-shift. Systems read through `TUNING` (or take an optional `t` argument for
what-ifs). `npm run sweep -- <block.dial> v1,v2,v3` reports a curve.

**The first sweep was a lie.** It built a patched document per value, printed a header, and
passed the patch nowhere: three different values produced one identical row, and it looked like
a measurement. Fixed by making the patch reach the systems (`tune()`), plus a guard that exits
non-zero if the dial did not take effect. *A tuning tool that silently does nothing is worse
than no tool, because it produces confidence.*

Two dials were then found not to be wired at all — `storylets.cards_per_shift` and
`cards_first_shift` were hardcoded `2` and `1` in both `main.ts` and `campaign.ts`. Sweeping
them did nothing until they read the document. This is the same duplication that made the
ledger and the wage disagree: a constant in two callers is a constant that will diverge.

### What the sweep now says, which is not reassuring

```
sweeping district.turn_shifts 1,3,5      → flat: 31.7 / 31.8 for every value
sweeping district.available_threshold     → flat
sweeping storylets.cards_per_shift 0,1,3  → 31.6 / 31.4 / 31.3  (moves, barely)
```

**Grievance is absorbing.** Once a household reaches `available` it never leaves: there is no
path back down in the model. So the *number* of angry nights before the turn only shifts timing,
and by shift 15 the outcome is identical. `turn_shifts` is therefore a dial with no range — the
first one the project has.

That is a design finding, not a bug to patch: an absorbing state is a legitimate choice for a
regime simulator (the Cell recruits and does not un-recruit), but it means *the district has a
one-way door and the campaign has no recovery loop.* If the intent is that a Warden can win
back a block, the model needs a decay path from `available`; if the intent is that they cannot,
then `turn_shifts` should be documented as timing-only and removed from any "difficulty" dial.

## 6. What Phase 4 should do next

1. ~~Move act-collection into `shift-cycle.ts`~~ — **done**: `collectActs()` is shared, with
   four tests that assert the ordering properties directly.
2. **Reconcile the ledger's numbers** (§4) and then wire the economy into the campaign loop,
   which is what moves `supply_deficit` and `force_index`. §2d says this is the gate on
   temperature meaning anything at all.
3. **Decide whether `available` is absorbing** (§5). If it is, say so; if not, add the decay
   path — otherwise the campaign has no recovery loop and `turn_shifts` is a dial with no range.
4. **Decide the known-cast question honestly** (§2c): six recurring households may be the
   right design. If it is, write it down as a decision; if it is not, widening it is a
   content problem, not a systems one.
5. **Then tune.** Not before: `npm run campaign` exists now, and a tuning session that ends
   without a before/after pair should not be recorded as a decision.
