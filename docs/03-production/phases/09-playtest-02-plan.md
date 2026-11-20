---
id: PT-03
title: "Playtest 2 response — the incident becomes the screen"
status: review
owner: design
depends_on: [PT-02, PH-2]
updated: 2026-11-18
---

# Playtest 2, steps 1 and 2

PT-02 recorded the scope ("a tactical shooter with a bureaucracy sim") and ordered the work.
This doc records the first two steps and what is still outstanding, because the phase rule is
that the as-built doc tells the truth about what exists.

## Step 1 — the incident is the screen (done)

The complaint inside the scope statement was not that the tactics were bad, it was that the
tactics were *furniture*. The incident screen was three columns — entry list, 460px floor plan,
subject list — so the part of the game that was supposed to be the game occupied about a third
of the window, at a zoom where a corridor was eight pixels wide.

What changed:

- `createPlan(inc, width, { camera: true, zoom })` — the same renderer, two readings of the same
  map. Panel mode still squeezes the whole floor into a box for the docket view. Camera mode
  fills the canvas and centres on `inc.warden`, clamped so the building never leaves the screen.
- The incident view is `inset:0`: a top bar (sector, address, three health pips), the map, a HUD
  strip (force rung, authorisation, detained, casualties), and the verb row. The entry options
  and the subject list moved into a **drawer** over the map, on **Tab**, closed with **Escape**.
  The strip says so on screen — an undocumented verb is the same failure playtest 1 found with F.
- `screenToWorld` moved into the renderer, because the view could not invert a camera it did not
  own. Aiming would otherwise point at the wrong wall the moment the camera existed.

Nothing about the plan's honesty rules changed: unknown rooms are still walls only, a hidden
subject is still not drawn, and a cleared room still gets its claim underlined.

## Step 2 — the tactical layer can hurt you (done, first pass)

`soloHits` was counted and then ignored: the Warden in the shooter could not be hurt, so no
scene could go wrong. That is fixed, and deliberately **not** with a game-over:

- `Incident.wardenHealth` (3) and `takeHit()`. A hit is a **noise event** (radius 8) — an
  injured officer shouting is the same kind of fact as a door being kicked.
- Wounds **slow** the body (`WOUND_SLOW = 0.12` per hit) and **shake the aim line** in the
  renderer. The penalty is visible before it is fatal, which is what a shooter needs.
- Three hits **put the Warden down**; `step()` then ends the scene, and `result().wardenDown`
  carries it into the docket with a radio line on close.
- The consequence is paperwork, not a retry screen: a downed officer files a room-claims sheet
  full of rooms nobody finished. That is the correct failure state for this fiction, and it is
  why the two halves are one game rather than two.

Not yet done: **no hostile actually shoots back from range yet** — `takeHit()` is wired and
tested, but the thing that calls it during play is still the solo firefight cadence, so the
danger is real but shallow. Step 4 (enemy behaviour: cover, call-outs, surrender) is what makes
it interesting.

## Ordered plan — status

| # | Step | Status |
|---|---|---|
| 1 | Full-screen incident with a following camera | **Done** |
| 2 | Make the tactical layer dangerous (injury, not death) | **Done, first pass** |
| 3 | A second and third interior | **Done** |
| 4 | Enemy behaviour — cover, call-outs, surrender | Outstanding (the shallow half of step 2) |
| 5 | Content volume | Outstanding |

Steps 3–5 are deliberately after 2: more interiors of a scene that cannot go wrong would only
multiply the corridor tour.

## Known limits, stated rather than hidden

- The camera has no smoothing; it snaps to the Warden. At 26 px/tile the snap is small enough
  that it reads as a camera rather than a cut, but it is not tuned.
- `wardenHealth` is a constant three. Job rank, armour, and prior injuries do not enter it,
  because there is no balance model to be faithful to yet — see the open wage/bill contradiction
  in `05-phase-4-entry.md` §4. Two balance constants invented to satisfy a test would be worse
  than one honest placeholder.
- Nothing in the audit reads `wardenDown` yet. The docket can see it; no rule punishes it.
