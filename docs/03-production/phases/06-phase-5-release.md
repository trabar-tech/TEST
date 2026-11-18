---
id: PH-5
title: "Phase 5 — Polish, performance, release (4–6 sessions)"
status: review
owner: tech
depends_on: [PH-4, TECH-01]
consumed_by: [PH-6]
updated: 2026-11-18
---

# Phase 5 — Polish, performance, release

**Phase thesis:** *a browser game lives or dies on the first ten seconds and the thirtieth minute.*

No gate here — release is a checklist plus a **soak test**. The phase is short by design: polish
before the content is final is wasted, and a web build's performance work is cheap when the
systems are already small (which Phase 0 bought us).

---

## 1. Scope

**In:** performance pass; accessibility; diegetic onboarding; audio mix and ducking; save
migration; New Game+ "Known Quantity"; Continuing Service (endless); release build, hosting,
crash-free soak, telemetry-free privacy stance, store page copy.

**Out:** new systems, new content types, additional factions, localisation (a v1.1 project).

---

## 2. Entry criteria

- [ ] **G3 passed** (or the campaign reduced per the G3 ladder)
- [ ] Content frozen (no new micro-events, directives or incidents during this phase)
- [ ] A real device test plan: the reference laptop, a mid-range desktop, and one weak machine

## 3. Exit criteria

- [ ] 60 fps at 1080p on the reference integrated GPU; no frame over 33 ms in a 30-minute soak
- [ ] Initial payload < 40 MB (hard ceiling 250 MB); time to first playable < 15 s on 20 Mbps
- [ ] Full keyboard-only playthrough of the Desk; font scale 125% works; colour-blind-safe coding
- [ ] First honest report filed in < 2 minutes with no manual and no tooltip hunting
- [ ] A 30-minute session with no console errors, no memory growth beyond 50 MB
- [ ] Save from the previous build migrates and loads
- [ ] All docs in `02-systems/` are `implemented` or `deprecated` — none left `draft`

---

## 4. Task cards

### P5-T01 · Performance pass
- **What:** atlas packing; object pooling (agents, corpses, particles, UI rows); draw-call audit;
  Case File virtualisation; lazy-load act content; audio compression; input latency check.
- **Acceptance:** 60 fps @1080p on the reference machine; < 120 draw calls; no GC spike > 8 ms in
  a 30-minute trace.
- **Cut candidate:** pooling (if it's already smooth).

### P5-T02 · Accessibility
- **What:** full keyboard path on the Desk; focus order; font scale 100–150%; colour-blind-safe
  classification (shape + letter, never colour alone); reduced-motion option; subtitle-style
  radio captions; no time-critical input in the filing flow.
- **Acceptance:** a tester completes a full shift without a mouse; a colour-blind tester reads all
  6 classifications and the exposure bands correctly.
- **Cut candidate:** reduced-motion (keep everything else).

### P5-T03 · Diegetic onboarding
- **What:** shift 1 walks the player through inspection, filing and the exposure gutter **in
  fiction** (a superior explains, impatiently); no modal tutorials; the gutter's first appearance
  is narrated as procedure.
- **Acceptance:** a first-time player files an honest report in < 2 min with no instruction; they
  can explain the gutter to the tester unprompted.
- **Cut candidate:** narration → a single card of in-world policy text.

### P5-T04 · Audio mix + ducking
- **What:** ambience beds by temperature band; ducking during inspections (the citizen should be
  audible breathing); radio bark priority (Overwatch always audible); loudspeaker reverb.
- **Acceptance:** during an inspection the bed drops ≥6 dB and the citizen is audible; the radio
  is never masked by ambience.
- **Cut candidate:** reverb.

### P5-T05 · Save migration + New Game+ "Known Quantity"
- **What:** migrations from every shipped version; NG+ starting at Act III with a suspicious
  Directorate, where the previous Case File is **read aloud as evidence** (cheap: it's data we
  already store).
- **Acceptance:** an old save loads; NG+ quotes three real lines from the previous run, verbatim.
- **Cut candidate:** NG+.

### P5-T06 · Continuing Service (endless)
- **What:** procedural shifts at final rank in a persistent sector; no ending; the sector keeps
  its grudges.
- **Acceptance:** 20 procedurally generated shifts without a content desert (Arbiter budgets hold
  past shift 20); a player can play "one more shift" indefinitely.
- **Cut candidate:** Continuing Service (ship campaign only).

### P5-T07 · Release build + soak
- **What:** production build; static hosting; version string in the UI; error boundary that
  offers "continue from last shift"; a privacy note (no telemetry by default).
- **Acceptance:** cold load from a fresh browser profile; 30-minute soak on the weakest test
  device; unplugging the network mid-session doesn't break anything.

---

## 5. Session plan (4–6)

| Session | Do |
|---|---|
| A | T01 + profiling |
| B | T02 + T03 |
| C | T04 + T05 |
| D | T06 |
| E–F (buffer) | T07, soak, docs close-out |

## 6. Release checklist (the real deliverable)

- [ ] Cold-load test on 3 machines, 2 browsers
- [ ] The 10-minute stranger test: no words from you, no docs, note where they hesitate
- [ ] Docs closed out: every system spec `implemented`, the roadmap's tasks `verified`/`cut`
- [ ] Cut List final: every cut recorded with its reason
- [ ] The pitch in `00-pitch.md` still describes the thing that exists (this is usually where it
      has drifted — fix it)
- [ ] A "what we'd do with another 6 months" note written *before* starting OVERSEER, so scope
      creep has somewhere to go that isn't the base game

## 7. Post-release posture

Bug fixes only for 4 weeks. **No new systems.** If a systems idea arrives, it goes into the
OVERSEER file or a `post-1.0.md`, never into the base game — this is the discipline that makes
the expansion possible (`ADR-0002`'s data stability is only worth anything if the base game stops
moving).
