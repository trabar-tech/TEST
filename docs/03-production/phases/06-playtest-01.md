---
id: PT-01
title: "Playtest 1 — first human session, findings and fixes"
status: review
owner: design
depends_on: [PH-1, PH-2, PH-3]
updated: 2026-11-18
---

# Playtest 1 (first human session)

**Not a gate.** This was one tester, unprompted, on the preview build — not G0's three
untrained testers with a script. It is recorded because it caught four things the suite could
not, and because the expectation it surfaced is a design question, not a bug list.

## What the tester said

> "Nothing changed for me, i get spammed (shortly after entering they come basicly
> consequently) with the same row of options, clicking to answer also ends up setting my
> character to move, i can interrogate anyone at any time no matter how much is the distance
> between us, i imagined more of a shooter top down style with greater interactions, good ai,
> not every mission would be ready or not style, some would be more of a check up to see if
> there are infractions."

## Bugs (fixed — `tests/playtest-fixes.test.ts`)

### 1. Answering a question moved the Warden

The scene overlay is a child of the app host, and click-to-move listens on that host. Every
click on a modal therefore *also* became a movement order.

Fixed at the seam: modals stop `pointerdown`/`pointerup`/`click`/`wheel` from reaching the
host, and `main.ts` refuses world clicks whenever any overlay is open.

**My first fix broke the modals.** I stopped propagation in the *capture* phase on the
container — which fires before the event reaches the target, so the desk's own **Sign and
file** button never received its click and the shift could not be filed. Nine tests caught it,
and none of them explained it; a `console.log` probe inside the handler that never printed
did. Stopped in the bubble phase instead.

That is worth recording twice: the bug was a *seam* bug, and the fix for a seam bug is the
most likely place to create the next one.

### 2. The same row of options kept coming back

`drawScenes()` rebuilt the shift's scene log from scratch, discarding the record of what had
been played — so every re-entry re-issued every answered card. It is now idempotent per shift,
and a scene cannot open behind the desk (`phase !== 'beat'` returns early).

### 3. Anyone could be interrogated from anywhere

`openInspection` had no range check, which hollowed out walking — the only verb the beat has.

`Simulation.REACH` (78 world units) now gates it, in the system rather than the UI. **Out of
reach is not a refusal:** clicking a distant citizen walks the Warden to them and the
inspection opens on arrival (`approachAndInspect`), because being told "too far" while a person
stands across the street reads as broken.

This invalidated every test that teleported the Warden to inspect. Each now walks (`talkTo`),
which is slower but is the game. The campaign runner did too — it had been inspecting without
moving, so `known` was always zero and recurrence never had anybody to name.

## The expectation: "a top-down shooter with real interactions"

This is the most useful sentence in the report and it should not be argued with. What exists
is a **paperwork shift**: walk a small district, inspect a handful of people, file claims, be
audited. What was expected is a **tactical action game** with an AI-populated district and
varied mission types.

Both are coherent games. They are not the same game, and the repo has to say which one it is
building instead of letting a preview imply the other.

The docs are unambiguous — `00-pitch.md` and `GDD §3` describe a bureaucratic-inspection game
where the paperwork *is* the mechanic, and the tactical layer exists to make force consequences
legible. So bug #3's fix is right in spirit: the Warden walks.

What the expectation *does* legitimately ask for, and which is currently missing:

1. **Interaction depth per person.** Right now an inspection is three questions and a stamp.
   The tester asked for "greater interactions" and that is fair.
2. **The district should feel populated and purposeful** — "good ai". Citizens currently walk
   routines and react to the Warden; they do not have business of their own.
3. **Varied shift shapes** — "not every mission would be ready or not". The beat is currently
   one thing: walk and inspect. A shift with no incidents, or one that is purely a check-up,
   or one that goes wrong before it starts, is a *content* and *scheduling* question, not a
   new engine.

None of those is started. They are recorded here so the next session does not mistake "the
bugs are fixed" for "the game is now what the tester pictured".

## What is not answered

- Whether the walk-only beat is the right amount of movement for 15 minutes (needs G0).
- Whether three questions is the right inspection length, or whether deeper conversation
  replaces the third question.
- Whether a "quiet shift" would feel like breathing room or like nothing happening.
