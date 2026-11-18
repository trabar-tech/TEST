---
id: PH-1
title: "Phase 1 — The Record vertical slice (5–8 sessions) — GATE G0"
status: review
owner: design
depends_on: [PH-0, SYS-REC-01, ADR-0002]
consumed_by: [PH-2]
updated: 2026-11-18
---

# Phase 1 — The Record

> **This is the most important phase in the project.** Everything else either feeds the Record or
> reads it. If this phase produces something a stranger finds compelling for fifteen minutes, the
> game exists. If not, no amount of Phase 2 helps.

**Phase thesis:** *the player should feel the specific discomfort of a form that is watching them.*

---

## 1. Scope

**In:** a walkable block in grey boxes; 6 citizens with one routine each; the citizen card with 6
fields and 3 checks; the inspection conversation (temperament + 3 questions + outcome); the Desk
form (1 page, stamps, steppers, tags, free text, exposure gutter); the audit with a stamped
consequence sheet; `SectorBelief` with one visible next-shift consequence; ~30 barks.

**Out:** combat, doors, squads, crowds, factions, economy, family, campaign, art.

---

## 2. Entry criteria

- [ ] Phase 0 exit checklist complete (especially determinism + save)
- [ ] `SYS-REC-01` approved (it is) and `ADR-0002` locked
- [ ] The citizen card's 6 fields and 3 checks chosen (they are, `SYS-REC-01` §2)
- [ ] One 4-block map exists as JSON, with interiors that don't matter yet

## 3. Exit criteria

- [ ] A shift runs briefing → Beat → Desk → audit → *next shift* with one visible consequence
- [ ] A camera-observed lie is caught 100% of the time, and the player *saw* the camera first
- [ ] An honest report never produces a surprise review (deterministic, asserted in a test)
- [ ] A visible **crack** appears in a line whose stability drops below 0.4
- [ ] Filing a 5-line docket takes < 90 seconds when decisive (measured, not estimated)
- [ ] The build is playable for 15 minutes by someone who was told nothing

---

## 4. Task cards

### P1-T01 · `ReportLine` schema, event log, serialisation
- **Why:** the keystone data structure (`ADR-0002`). Everything downstream — audit, belief, Case
  File, OVERSEER import — is a query over this.
- **What:** `ReportLine` exactly as specified in `SYS-REC-01` §3; an append-only event log with
  stable IDs; `RecordStore` with `append / live / query / contradictions / belief / archive`;
  round-trip serialisation; a `slack()` pure function with table-driven tests.
- **Acceptance:** a hardcoded event → line → save → load → `belief()` produces an identical object;
  `slack()` test table (10 cases) passes, including "omission" penalties.
- **Not included:** the audit logic (T06), the UI (T05), cross-line contradiction resolution.
- **Cut candidate:** `query()` beyond two methods (tags, category) — but `archive()` stays.

### P1-T02 · Beat mode: walking, 6 citizens, hover/interact
- **Why:** the Beat must feel like *a street you know*, not a menu with a walk animation. Presence
  and dread are cheap to implement and expensive to retrofit.
- **What:** click-to-move on the Phase 0 navmesh; 6 citizens with one routine each and a `dread`
  value; hover → name/paper-icons; click → inspection; a patrol clock; a very simple noise/vision
  cue so the player feels seen.
- **Acceptance:** a tester can walk the block and identify which of the 6 is "the nervous one"
  without being told; dread visibly changes behaviour (the nervous one avoids your route).
- **Not included:** micro-events (T08), crowds, doors.
- **Cut candidate:** routines → static posts with different animations.

### P1-T03 · Citizen card: 6 fields, 3 checks, generated irregularities
- **Why:** the Papers-Please surface, but it must be *reasoned*, not pixel-hunted
  (`SYS-REC-01` §2).
- **What:** card UI with generated fields; irregularity generator with severity weights (an
  irregularity must be *visible* at the stated severity — no 1-pixel tells); the 3 checks (ink
  colour, seal rotation ±15° with visible warp, chip checksum); a "full check" that takes 20 s of
  in-game time.
- **Acceptance:** a citizen with a bad chip serial can be caught in < 15 s by someone who has read
  the rule once; a citizen with *no* irregularity cannot be falsely caught by the checks.
- **Not included:** forged documents (perk, Phase 4), bribe negotiation.
- **Cut candidate:** the full-check (keep the 3 checks).

### P1-T04 · Inspection conversation: temperament + 3 questions + outcome
- **Why:** this is the answer to "is Papers-Please repetition a problem?" (`GDD` §8 unknown 2).
  Conversation replaces spot-the-difference.
- **What:** 5 temperaments with a *verbal* tell each; a pool of ~10 contextual questions (3 uses);
  answers generated from the citizen's truth + temperament style; 6 outcomes (P/C/D/X/B/–) each
  writing a candidate report line; outcome feedback in the world (not a toast).
- **Acceptance:** a "rehearsed" liar can be identified by asking two specific questions and
  observing over-consistency; a tester can *explain* why they detained someone; the same citizen
  yields the same answer to the same question twice (no random answers).
- **Not included:** interrogation (Phase 4), informants, bribes beyond a stub.
- **Cut candidate:** questions 8–10; temperaments down to 4 (drop "helpful").

### P1-T05 · Desk form: 1 page, stamps, steppers, tags, free text, exposure gutter
- **Why:** the game's thesis surface (`SYS-REC-01` §6). DOM, not canvas, so typing and keyboard
  navigation work (`ADR-0001`).
- **What:** docket on the left, form centre, exposure gutter right, stamp tray bottom, clock top;
  keyboard path (Tab/Enter); 240-char plain-text field; tag chips from the controlled vocabulary;
  stamp animations (~250 ms, satisfying); live exposure computation with a three-band readout and
  hover-to-explain.
- **Acceptance:** filing 5 lines takes < 90 s decisively; the exposure gutter always explains
  *why* (camera/witness/contradiction) on hover; a full keyboard playthrough works; no lie is
  punished that the gutter didn't warn about.
- **Not included:** the Case File browser (Phase 4), printing/export, localisation.
- **Cut candidate:** free text (tags only) — this is cut #2 in the roadmap and it is a *big* tone
  loss, so test it before cutting.

### P1-T06 · Audit engine + stamped consequence sheet
- **Why:** the audit is the game's antagonist and its feedback channel. It must be deterministic
  and always legible (`SYS-REC-01` §5).
- **What:** contradiction test (machine records), witness test (`will_talk × reliability ×
  (1 − stability)`), peer pattern test; `review_risk` aggregation; a stamped sheet that names the
  line, the witness and the evidence; `ai_auto` filings for silence.
- **Acceptance:** camera-observed lie → caught 100% (test); honest filing → zero unexpected
  reviews (test, 1,000 simulated filings); every consequence on the sheet is traceable to a
  specific line and witness.
- **Not included:** Compliance Review escalation (Phase 4), squad report interactions.
- **Cut candidate:** peer pattern test (keeps the other two).

### P1-T07 · `SectorBelief` + one visible next-shift consequence
- **Why:** this closes the loop. Without it, filing is journaling.
- **What:** belief aggregation from claims only (a lint boundary forbids reading `truth`); one
  consequence wired end-to-end: under-reporting resistance changes the *next shift's briefing
  text and the incident sent*. Small and visible beats broad and invisible.
- **Acceptance:** under-reporting resistance for one shift visibly sends a worse incident next
  shift, and the briefing says why in-fiction ("Sector command has re-tasked resources").
- **Not included:** temperature, factions, directors (Phase 3).
- **Cut candidate:** none. This task is the phase.

### P1-T08 · Grey-box art pass + ~30 barks
- **Why:** the slice must be *felt* to be judged at G0. Tone is not a Phase 5 problem.
- **What:** readable grey boxes with the Directorate's teal accent; 3 ambient sounds (loudspeaker,
  tram, printer); 30 barks that establish the regime's voice; a quiet music loop that ducks during
  inspection.
- **Acceptance:** a tester can describe the regime's tone from the slice alone, unprompted.
- **Not included:** character art, animation polish, VO.
- **Cut candidate:** music (keep barks + ambience).

---

## 5. Session plan (5–8)

| Session | Do | End state |
|---|---|---|
| A | T01 | the Record exists as data, tested |
| B | T02 + T03 | walking a block, checking a card |
| C | T04 | a conversation that can catch a liar |
| D–E | T05 | the form, playable and typed |
| F | T06 | the audit that answers back |
| G | T07 + T08 | the loop closes and has a tone |
| H (buffer) | fix + build playlist | G0 build |

## 6. GATE G0 — *"Do I care about what I write?"*

**Run the gate protocol** (`00-phase-index.md` §2). 3 testers, 15 min, no narration.

**Pass question, with threshold:**
> After filing, does the tester *spontaneously* talk about what they wrote — and describe a
> temptation to lie — **without being prompted**?
> **PASS:** 2 of 3 do. **PASS WITH FIXES:** 1 of 3, with a named legibility fix.
> **FAIL:** 0 of 3, or testers treat the form as a chore to click through.

**Secondary checks (recorded, not gating):**
- time on form vs. time on Beat (expect 40/60; if 15/85 the desk is a toll booth)
- did they read the exposure gutter before their first stamp
- first-lie reason, verbatim

### If G0 fails — the pre-committed ladder
1. **Cut decisions per line from 6 to 3** (classification, force, free text). Re-test with new
   testers, same day if possible.
2. **Move the tension to the gutter**: make exposure the *only* thing on screen during filing
   (temporarily), so the player can't not look at it.
3. **Make one lie mandatory** in the tutorial shift: the quota cannot be met honestly on shift 1.
   Force the player across the line once, early, with full disclosure.
4. Still failing → **stop.** The concept's core is wrong at this scope. Go back to `01-gdd.md`
   §3.2 and write an ADR on what the Record should be instead. Do **not** proceed to Phase 2.

## 7. Phase-specific cut line

If Phase 1 runs long, cut in this order: free text → temperaments to 4 → questions to 6 →
`query()` API → the barks (keep ambience). **Never cut:** the exposure gutter, the audit's
legibility, `SectorBelief`, or "silence is a claim".

## 8. Gate result (fill in)

*Date · testers · pass question outcome · quotes · decision · fixes named · docs updated.*
