---
id: PT-02
title: "Playtest 2 — the intended game is a tactical shooter with a bureaucracy sim"
status: review
owner: design
depends_on: [PT-01, PH-2, PH-3]
updated: 2026-11-18
---

# The intended game, stated plainly

Playtest 2, verbatim:

> "basically itd be a tactical shooter with bureaucracy sim"

That is a **scope statement**, not a bug report, and it changes what the repo is building.
Recording it here so no future session has to infer the genre from a commit log.

## What this settles

The docs did not disagree — they were *ambiguous in the right direction*. `00-pitch.md` and
GDD §3 describe a bureaucratic-inspection game; the tactical layer (P2, 2,550 lines) was
written as the place where force has consequences. Both halves exist. What was never decided
is **which one the player spends most of their time in.**

The answer is the tactical half. The paperwork is the *sim* around it, not the game with a
raid attached.

## What this does NOT require throwing away

Almost nothing. This is the useful part: the tactical layer is the most developed system in the
repo and it was under-exposed, not wrong.

| System | Status against the stated intent |
|---|---|
| Incident (interior, doors, hostiles, noise, force rungs) | **Core.** Keep, expose, extend. |
| Squad orders, breach, clear, detain | **Core.** This is the shooter's command layer. |
| Force continuum, authorisation, exposure | **Core.** This is the "bureaucracy" half and it is already good. |
| `IncidentResult` → docket → audit | **Core.** The loop that makes the shooting mean something. |
| Street beat + inspection | **Support.** The check-up half: "some would be more of a check up". |
| Storylets, scenes, recurrence | **Support.** Flavour between raids, not the main event. |
| Ledger / economy (unwired) | Deferred. Still blocked on its own contradiction. |

## What changed today, and why it is the right first step

The tactical layer had **no direct control**. The player issued orders to a plan board and a
pawn executed them; there was no body. A shooter without a body is a strategy game.

So `Incident` gained the smallest possible control layer:

- `setMoveIntent(dir)` — WASD, normalised so diagonals are not faster, walls stop the body.
- `setAim(angle)` + an aim line drawn on the plan, which turns red when a wall is in the way.
- `fire()` — a shot records rung-5 force used, makes the loudest noise in the building, and is
  **unauthorised force** unless a rung-5 authorisation was granted.

The design constraint kept deliberately: **firing is not an aim check.** A shot that happens is
a shot that happened; whether the record is survivable is the question. That is what makes a
shooter *about paperwork* rather than a shooter with paperwork pasted on.

Eleven tests in `tests/tactical-control.test.ts`, including that a diagonal is not faster, that
walls stop the body, that the cadence prevents click-spam, and that a fatal shot increments
casualties.

## What is honestly still missing for "tactical shooter"

Not close yet. In rough order of how much each would change the feel:

1. **The incident is a panel, not a screen.** It should take the whole window and run at full
   framerate with the camera following the Warden, not sit between two sidebars.
2. **No enemy behaviour worth the name.** Hostiles have a post, a compliance number, and a spot
   check. They do not flank, take cover, or surrender under pressure beyond a threshold.
3. **No cover, no suppression, no reload, no weapon variety.** One trigger, one cadence.
4. **One interior.** `interior_flat14.json`. A shooter needs more than one room to shoot in.
5. **No reason to go in quietly.** Stealth and loud both end in a paperwork line, but the
   mechanical difference is thin.
6. **The Warden cannot die.** `soloHits` is counted and then ignored. There is no failure state
   in the tactical half, which removes most of the tension a shooter has.

Item 6 is the most important and the most design-loaded: a game about a bureaucracy that
punishes you wants the *record* to be the failure state, not death. That is coherent — but it
means the tactical layer has to be dangerous in a different currency (injury, escalation,
witnesses), and right now it is not dangerous at all.

## Order I would work in

1. **Make the incident full-screen with a following camera.** Without it, the control layer I
   just added is invisible — it is a map in a sidebar.
2. **Make the tactical layer dangerous.** Escalation, injury, and a real cost to being shot.
3. **A second and third interior**, so shifts vary: "not every mission would be ready or not".
4. **Enemy behaviour**: take cover, call out, surrender when outnumbered.
5. Only then touch content volume.

## The honest caveat

Nobody has played the direct-control build. 741 green tests say the machinery is sound; they
say nothing about whether walking into a flat with a trigger under your finger feels like the
game you pictured. That needs a playtest, and it should be the next thing that happens.
