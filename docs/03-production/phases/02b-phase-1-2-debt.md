---
id: PH-2B
title: "Phase 2b — Closing Phase 2's debt before Phase 3 (1 session)"
status: implemented
owner: engineering
depends_on: [PH-2]
consumed_by: [PH-3]
updated: 2026-11-18
---

# Phase 2b — Debt, and the thing that makes G1 runnable

**Why this file exists.** Phase 3's entry criteria begin with *"G1 passed"*. G1 needs three human
testers, a room and a recorder — none of which exist here. The phase index's standing rule is
explicit: *"If Phase N-1's exit checklist isn't met, spend a session closing the debt instead."*
So this session did not start Phase 3. It closed the four things Phase 2 said were not done **and
that could be closed without a human**, plus the one thing a gate cannot run without.

---

## 1. What was closed

| Debt (from `03-phase-2-tactical.md` §6b) | What exists now | Test |
|---|---|---|
| 2 · *"Nobody has played it"* — no protocol for the G1 session itself | **`src/ui/playlist.ts`**: a 7-step, ~25-minute scripted session (`?playlist` or `P`). Every tester prompt is answered in their own words, and the whole thing exports pasteable markdown that refuses to invent a result | `tests/ui-playlist.test.ts` (8) |
| 6 · `force_index` did not persist across a shift or a save | **`src/systems/sector.ts`**: the sector's memory on `GameState.flags`, two pure writers, decay at the shift boundary, tolerant of old and corrupt saves | `tests/sector-memory.test.ts` (11) |
| 3 · the renderer did not draw the incident | **`src/render/plan.ts`**: a canvas floor plan in world coordinates — silhouettes stay walls-only, a hiding subject is never drawn, a cleared room gets a rule under its name, the Warden gets a Focus ring | `tests/ui-incident.test.ts` (14) |
| 7 · the crowd had no ring | **`drawCrowdRing`** + `HEAT_RING` bands: the market's temperature is a pulsing ground ring you can see from down the road, no number anywhere | `tactical-crowd.test.ts` |
| Deviation: *no drag-reorder* | `Squad.reorder` / `Squad.cancel`, and the comms strip is now a row of clickable order chips (click = to front, shift-click = drop) | `tactical-incident.test.ts`, `ui-incident.test.ts` |

## 2. What is still open, and why it is not closeable here

1. **G1 itself.** Three humans. The playlist is the *instrument*; it is not the measurement.
2. **Cover, sightlines, suppression.** This is a design addition, not debt — it changes the
   combat model, and it should be decided by G1's result, not by a quiet session.
3. **`force_index` feeding the *incident deck*** (P3-T06's budgets) — that needs Phase 3's Arbiter.
   What is closed is the part Phase 2 promised: it persists, it decays, and it sets tonight's
   starting rung and mood.
4. **The crowd still has no bodies.** Heat is a ring and a number in the model; 34 agents are not
   34 dots. Making them dots is a Phase 3/5 rendering question, and it may not be worth it.

## 3. One design change, recorded

`Incident.clearRoom` used to derive the claim *and* the fact on every call, which meant
`result()` could quietly un-claim a room that the player had already reported clear. That is the
opposite of the phase's thesis: **a claim is sticky**. There is now a `clearClaims` map, and
`result()` reads the claim from it while recomputing only the fact. The test that caught this
(`incident-to-record.test.ts` → "lands as one card") asserts the number of cleared rooms, and it
went red the moment the sticky map existed — which is the good direction for a test to move.

## 4. Verified

```
npm run verify          → 358 passed (358) in 28 files
npm run build           → ✓ built in 5.18 s
npm run validate        → ✓ content valid (1 bundle, 0 warnings)
npm run check:boundaries→ ✓ clean (40 source files, 5 rules)
dev server              → 200 on / and /?playlist
```

Not verified, and named: **no human has run the playlist.** It is exercised end-to-end in jsdom
(`ui-playlist.test.ts` drives all seven steps and asserts the report), but a protocol that has
never been run by a stranger is a hypothesis about protocols.
