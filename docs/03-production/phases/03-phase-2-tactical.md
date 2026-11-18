---
id: PH-2
title: "Phase 2 — Tactical layer (6–9 sessions) — GATE G1"
status: review
owner: design
depends_on: [PH-1, SYS-TACT-01]
consumed_by: [PH-3]
updated: 2026-11-18
---

# Phase 2 — Tactical layer

**Phase thesis:** *a room you clear should cost you something on a form.*

The trap this phase must avoid is becoming a good tactics game that has a form attached. Every
task here exists to make the tactical layer **feed the Record** — not to make it deeper for its
own sake.

---

## 1. Scope

**In:** doors (state machine) + 8 entry types + noise events; information gating (silhouettes,
sound pings, one camera); solo **Focus**; the 8-verb order queue with literal-execution squad AI;
the 5-rung force continuum + authorisation + wound model; the persistent force ratchet; a crowd
mood graph; squad comms with the Flow bonus; "clear is a claim" integration with the Record.

**Out:** multiple maps beyond two; specialists (breacher/medic); the family layer; economy.

---

## 2. Entry criteria

- [ ] **G0 passed** (this is a hard gate — see `02-phase-1-record-slice.md` §6)
- [ ] Phase 1's `ReportLine` and audit stable for 5 consecutive test shifts without shape changes
- [ ] Two maps as JSON: one flat with 3 rooms (breach test), one street corner (checkpoint/crowd test)

## 3. Exit criteria

- [ ] A 3-order plan (stack → ram → clear) executes unattended without officers freelancing
- [ ] With no squad, Focus makes a 2-hostile room survivable ≥50% without damage
- [ ] Every rung-2+ action writes exactly one report line with the correct tool tag (test)
- [ ] A mis-cleared room produces a *wrong* line that the audit can expose
- [ ] 34 crowd agents + 4 officers hold 60 fps on the reference machine
- [ ] Two incidents from one shift produce a 5-line docket the player dreads filling

---

## 4. Task cards

### P2-T01 · Doors, breaches, noise events
- **Why:** the door is the whole tactical design in miniature: quiet is slow, fast is loud, loud
  is paperwork (`SYS-TACT-01` §4).
- **What:** the 6-state door machine; 8 entry methods with time/noise/risk/legitimacy columns from
  the spec; noise events with radius derived from method; damage numbers that feed the report.
- **Acceptance:** each entry method produces the documented noise radius in the log (table test);
  a neighbour two rooms away can hear a ram (assert via noise propagation); "knock and talk"
  never damages the door.
- **Not included:** traps on doors (Phase 3 content), lockpicking minigame.
- **Cut candidate:** entry methods down to 5 (drop split, roof, shout).

### P2-T02 · Information gating
- **Why:** without it, tactics become an omniscience puzzle and the Record's "clear is a claim"
  loses its teeth.
- **What:** unknown rooms render as architectural silhouettes; sound pings (3 s, within 2 walls);
  one camera feed (requisitioned); a recon-token UI.
- **Acceptance:** a tester cannot see room contents without a source; opening a door reveals only
  what the unit's cone covers; the silhouette still reads as a *building* (players draw sane
  expectations).
- **Not included:** drone, informant plans (Phase 3 content).
- **Cut candidate:** sound pings (silhouettes + cameras only) — but this weakens listening play.

### P2-T03 · Solo Focus
- **Why:** Act I has no squad; the solo player needs a real tool (`SYS-TACT-01` §1). Also the
  highest-risk mechanic in the game (unknown 4).
- **What:** 0.35× timescale on RMB held; 6 s stamina budget; 9 s recharge; disabled with a squad
  attached; HUD that reads as *attention*, not a power meter; no enemy reaction slowdown.
- **Acceptance:** a 2-hostile room is survivable ≥50% of the time without damage (20 trials);
  Focus is never strictly better than Pause (measure: pauses per minute with/without squad);
  the stamina budget is felt, not counted.
- **Not included:** any bullet-time visual effect beyond a subtle vignette + audio filter.
- **Cut candidate:** **Focus entirely.** If cut, Pause must absorb the role and the game becomes
  pure Door Kickers. Record as cut #4 and rewrite `SYS-TACT-01` §1 the same day.

### P2-T04 · Order queue + literal squad AI
- **Why:** the Door Kickers layer, and the design's claim that officers are executors, not heroes.
- **What:** 8 verbs on hotkeys; 4-deep queue with drag-reorder; small behaviour trees (12–20
  nodes) for execution only; queue cancelled by contact unless `Disciplined`; two "thinking"
  tells (double-back, stand-and-look).
- **Acceptance:** stack → ram → clear runs unattended; a unit under fire drops its queue and takes
  cover; the score inspector shows why a unit chose cover (Phase 3 builds the inspector — here a
  console dump is enough).
- **Not included:** specialists, formations beyond stack/split, suppression mechanics.
- **Cut candidate:** queues beyond depth 2.

### P2-T05 · Force continuum + authorisation + wounds
- **Why:** "force is a cost, not a verb" (`GDD` P2). This is where the tactical layer earns the
  Record.
- **What:** 5 rungs with compliance/aggression effects; Field Authorisation radio call (4 s,
  logged); coarse wound model (healthy→dead); stabilise → witness; rung 2+ → exactly one line.
- **Acceptance:** every rung-2+ action writes exactly one line with the right tool tag (test);
  unauthorised rung 4 triggers a Compliance Review flag; a stabilised hostile appears as a witness
  in the audit's exposure calculation.
- **Not included:** injury persistence across shifts (Phase 4).
- **Cut candidate:** rung 5 (collective force) → Phase 3 content only.

### P2-T06 · Force ratchet
- **Why:** the mechanical statement of the brief's "suppression and rebellion feed each other."
- **What:** `force_index` accumulation per sector, 15%/shift decay, feeding next shift's starting
  compliance/aggression and the incident deck's difficulty band.
- **Acceptance:** three aggressive shifts measurably raise incident difficulty; three restrained
  shifts measurably lower it; the player can *feel* the difference in barks and starting moods
  without a meter.
- **Not included:** de-escalation levers (Phase 3 directives).
- **Cut candidate:** decay (linear accumulation only) — but then tune the campaign length down.

### P2-T07 · Crowd mood graph
- **Why:** Act II's central moral loop needs a crowd that can be *dispersed without arrests*.
- **What:** 12–40 agents on a social graph with shared heat, leaders and a grievance; the action →
  Δheat table from the spec; a ground temperature ring + bark density (no numbers); states
  milling → chanting → surging → scattering/riot.
- **Acceptance:** 34 agents + 4 officers at 60 fps; arresting a leader reliably escalates;
  loudhailer only works at low heat; dispersing with zero arrests is possible and is recorded as
  such.
- **Not included:** crowd-vs-crowd dynamics, barricades.
- **Cut candidate:** crowd size to 20 (cut #3).

### P2-T08 · Incident → Record integration ("clear is a claim")
- **Why:** the phase thesis. Without this, the two halves are still two games (RISK R2).
- **What:** a mis-cleared room leaves a hidden hostile; the report says cleared; the audit can
  expose it via a witness or a later incident; the *player's own* line becomes evidence against
  them.
- **Acceptance:** a deliberately mis-cleared room produces a wrong line, and within 2 shifts an
  audit or incident surfaces the error; the exposure gutter on a later line shows the contradiction.
- **Not included:** squad members filing their own lines (Phase 3).
- **Cut candidate:** none. This is the integration point the whole phase exists for.

### P2-T09 · Squad comms + Flow
- **Why:** keeps the "RT" in RTwP alive; without a real-time incentive everyone pauses and the
  real-time half dies (`SYS-TACT-01` §2).
- **What:** hotkey orders with voice acknowledgement; 3+ distinct orders in 5 s unpaused → Flow
  (+20% order-response, 8 s); paused orders with a squad take +0.4 s to acknowledge.
- **Acceptance:** a tester who uses Flow clears a room measurably faster than one who doesn't
  (stopwatch, same map); pausing is never useless, just slower.
- **Not included:** voice acting.
- **Cut candidate:** Flow (keep hotkey orders).

---

## 5. Session plan (6–9)

| Session | Do | End state |
|---|---|---|
| A | T01 + T02 | doors you can hear through walls |
| B | T03 | solo slow-mo that is tense, not superpowered |
| C–D | T04 + T09 | a squad that obeys and a reason not to pause |
| E | T05 + T06 | force that leaves marks |
| F | T07 | a crowd that pushes back |
| G | T08 | the bridge: a wrong line you wrote yourself |
| H–I (buffer) | tuning, perf, G1 build | playlist |

## 6. GATE G1 — *"Is the pause fun, and is the paper still the point?"*

Same protocol. Playlist: one shift, two incidents (a checkpoint and a flat breach), then the form.

**Pass questions (both must clear):**
1. **Tactics:** does the tester describe the incident as *planned* (they had a plan, it worked or
   failed legibly)? **PASS:** 2 of 3. "It was chaotic" is a fail.
2. **Integration:** does the tester's *account* of the incident include what they wrote about it,
   unprompted? **PASS:** 2 of 3. If they describe the fight and the form as separate events, the
   two games are still stapled (RISK R2).

**Recorded, non-gating:** pauses/minute, Focus usage, rung histogram, whether they lied about the
breach, and whether they *wanted* a squad.

### If G1 fails — pre-committed ladder
1. **Integration fail (most likely):** cut a mode. If squad orders and Focus both compete, drop
   squads from v1.0 (cut #4) and let solitaire carry Act I–II. Re-test.
2. **Tactics fail ("chaotic"):** reduce simultaneity — fewer hostiles per room, longer
   sight-lines, more explicit "who can see what" UI. Chaos in a tactical game is usually an
   information problem, not a difficulty problem.
3. **Both fail:** the tactical layer may be the wrong genre for this team. The fallback is a
   *checkpoint/inspection-only* game with incidents resolved as text-plus-consequence — cheaper,
   still on-thesis. Write the ADR before proceeding.

## 7. Cut line

Cut in order: Flow → rung 5 → squads (→ solitaire only) → crowd to 20 → sound pings → entry
methods to 5. **Never cut:** doors' noise→paperwork link, force→one-line rule, "clear is a claim".

## 8. Gate result (fill in)

*Date · testers · both pass questions · pauses/min · rung histogram · decision · fixes · docs.*
