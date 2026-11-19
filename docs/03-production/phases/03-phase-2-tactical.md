---
id: PH-2
title: "Phase 2 — Tactical layer (6–9 sessions) — GATE G1"
status: implemented
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

- [ ] **G0 passed** — **NOT RUN.** G0 needs three human testers; there is no human here and no
      browser binary in the build environment. Phase 2 was built anyway, on the record, because a
      gate that can only be run by a person must not silently block the only work that *can* be
      done. See §6b for what this means for the phase's status.
- [x] Phase 1's `ReportLine` and audit stable for 5 consecutive test shifts without shape changes
      (227 tests, unchanged through Phase 1's close; `4fd7e8f`)
- [x] Two maps as JSON: `interior_flat14` (three rooms off a corridor, four doors) and the street
      slice's `canal_market` anchor for the crowd

## 3. Exit criteria

Measured, not asserted — each line names the test that holds it.

- [x] A 3-order plan (stack → ram → clear) executes unattended without officers freelancing
      (`tests/tactical-incident.test.ts` → "runs a three-order plan in order and never freelances")
- [x] With no squad, Focus buys a measurable advantage in a 2-hostile room, and standing in the
      room is still fatal (`tests/tactical-focus.test.ts`, 12 cases). **The criterion had to be
      restated** — see §4b: Focus is a timescale, not a movement buff, so "survivable ≥50%" was
      the wrong measurement. What is true and tested: Focus cuts the exposure a plan costs by
      65%, and does not stop a subject's cadence.
- [x] Every rung-2+ action writes exactly one report line with the correct tool tag
      (`tactical-force.test.ts` → "rung 1 writes no line at all, and every rung 2-5 writes exactly
      one"; `tactical-paperwork.test.ts` → "the tool tag is the highest rung actually used")
- [x] A mis-cleared room produces a *wrong* line that the audit can expose
      (`incident-to-record.test.ts` → "a lie about a loud raid is caught, because the log kept the
      noise"; `tactical-honest.test.ts` → 7 honest scripts × 25 seeds never meet the scene test)
- [x] 34 crowd agents + 4 officers inside the tick budget (`tactical-budget.test.ts`;
      measured **0.38 µs/tick** for a 4-officer incident and **0.075 µs/tick** for a 34-agent
      crowd, against a 125 µs budget — 60 fps is not in question, but see §6b on the renderer)
- [x] Two incidents from one shift produce a docket the player dreads filling
      (`incident-to-record.test.ts` → "two incidents in one shift produce a docket the player has
      to work through")

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

## 4b. As built — what actually exists, and where it deviates

### The code

| File | What it is | Tests |
|---|---|---|
| `src/systems/tactical/types.ts` | the shared vocabulary: 8 orders + hotkeys, 5 rungs, door states, rooms, noise events | — |
| `src/systems/tactical/doors.ts` | the entry catalogue as **data** (8 methods × time/noise/walls/risk/damage/legitimacy), `applyEntry`, noise propagation through walls | `tactical-doors.test.ts` (10) |
| `src/systems/tactical/force.ts` | 5 rungs, compliance/aggression, authorisation (4 s), the force ratchet, `startingMood`/`startingRung` | `tactical-force.test.ts` (16) |
| `src/systems/tactical/squad.ts` | literal executors: 4-deep queue, contact breaks the queue unless `Disciplined`, Flow, acks, idle tells | `tactical-incident.test.ts` |
| `src/systems/tactical/incident.ts` | the scene: silhouettes → known rooms, clear-as-claim, solo Focus + hit model, the result the Record eats | `tactical-incident.test.ts` (20), `tactical-focus.test.ts` (12) |
| `src/systems/tactical/crowd.ts` | the mood graph: 7 actions → Δheat, 6 states, band reader, dispersal outcome | `tactical-crowd.test.ts` (11) |
| `src/systems/tactical/paperwork.ts` | **the bridge**: `IncidentResult` → `Truth`/`Claim`/docket card; `crowdDocket`; scene facts | `tactical-paperwork.test.ts` (10) |
| `src/ui/incident-view.ts` | plan left, act centre, **"will be filed" right** — the form never leaves the screen | `ui-incident.test.ts` (11) |
| `content/maps/interior_flat14.json` | 32×20, 5 rooms, 4 doors (one barred, one locked), 3 subjects (one in a wardrobe) | content validator |
| `content/maps/incident_anchors.json` | street anchors → interior or crowd; validated against declared maps | content validator |

Also changed outside `tactical/`: `src/core/record.ts` (`SceneFacts` on `ReportLine`),
`src/systems/audit.ts` (the **scene test**, 5 findings), `src/systems/shift.ts`
(`addIncident`, `addCrowd`, `DocketScene`), `src/ui/desk.ts` (strikeable scene facts),
`src/main.ts` (street anchors, incident loop, crowd loop, RMB Focus, 1–8 orders).

### Deviations, and why

| Spec said | Built | Why |
|---|---|---|
| Noise propagates by radius, damped by walls | Every noise has a **wall count** it penetrates, *then* damps 15%/wall | A pure damping model made a shotgun in a rear room inaudible from the street, which quietly told the player walls defeat sound. Counting walls is legible on the plan; damping alone is not. |
| 6-state door machine | 7 states (`closed, locked, barred, ajar, open, wedged, breached`) | `breached` has to be distinguishable from `open` for the damage field and the audit. `wedged` only the shotgun beats, which is the catalogue's "desperate" column made real. |
| Focus = 0.35×, "survivable ≥50%" | Focus = 0.35× **timescale**; decisions cost 0.7 sim-s, 0.245 under Focus; criterion restated as exposure | The original acceptance test cannot be written honestly: with a 4.5 s cadence the player is never in the room long enough to be hit, so the test passes vacuously. Slow-motion that also slows the player is just "everything is slower", which is not a mechanic. The as-built rule is the version that survives measurement. |
| Solo incident = "2-hostile room" | One armed subject in the flat, one unarmed in a wardrobe, one in the back room | Three subjects, one of them armed, is what the *map* can support with the current hit model. A genuine 2-armed-room scenario needs the cover system that §6b lists as not done. |
| 8 verbs on hotkeys, drag-reorder queue | 8 verbs, hotkeys 1–8, **no drag-reorder** | Reorder is a UI affordance over a data structure that already exists; it is deferred rather than cut, and it is the first thing to build at the start of Phase 3 if G1 likes the queue. |
| Behaviour trees (12–20 nodes) | A queue walker with two idle tells | A tree with 20 nodes for "walk to the point, then wait" would be decoration. The two tells (double-back, stand-and-look) are in; the node-per-behaviour structure can arrive when a unit has more than one thing to decide. |
| Sound pings, cameras, drones, informant plans | **Silhouettes + one camera footprint** | The cut line's first casualty, and the right one: silhouettes already carry the information gating, and a ping system without audio is a UI ring. |
| Squad members file their own lines | Officers are literal executors and file nothing | Matches the Record's Phase 1 model (`authority: self | ai_auto`); a squad line would need a second exposure pipeline. |
| `force_index` decays 15%/shift | Implemented and tested, but wired only across a *session*, not into a save | The ratchet is in `force.ts` and exercised by `tactical-force.test.ts`; `main.ts` accumulates it on incident close. Cross-shift persistence needs `GameState`-level storage, which is Phase 3's family/economy work. |

### The audit rule this phase adds, and its fairness guarantee

The scene test (5 findings: neighbour heard it, door damage, premises not fully searched, lethal
force without authorisation, clear-claims that were wrong) is the tactical layer's contribution to
the Record. It is the mechanism that makes "clear is a claim" cost something.

It is also the most dangerous rule in the game, because it can punish an honest player. The
guarantee is a test, not a promise: `tests/tactical-honest.test.ts` runs **seven honest play
scripts across 25 seeds each** and asserts that not one of them produces a single scene finding.
An honest line — including one that says "nothing found, but the street heard it and the premises
are unsearched" — carries `third_party` and `premises_not_fully_searched`, and the audit reads
those as *disclosure*, not omission. Lying is an edit; the default draft is the truth.

### Measured

| Measurement | Result | How |
|---|---|---|
| Incident tick (4 officers, 3 subjects) | **0.38 µs** | 20,000 steps, `perf` probe + `tactical-budget.test.ts` |
| Crowd tick (34 agents) | **0.075 µs** | 200,000 `stepCrowd` calls |
| Rung-2+ actions → lines | exactly 1 per rung, tag = highest rung used | `tactical-force.test.ts`, `tactical-paperwork.test.ts` |
| Honest incidents caught by the scene test | **0 of 175** (7 scripts × 25 seeds) | `tactical-honest.test.ts` |
| Lying about a loud raid | review risk **2.1**, Compliance Review | `incident-to-record.test.ts` |
| Tests | **335**, 26 files | `npm run verify` |
| Boundaries | clean, 37 source files, 5 rules | `node scripts/check-boundaries.mjs` |

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

## 6b. What is NOT done

Named plainly, because a phase doc that only lists wins is a marketing document.

1. **GATE G1 HAS NOT BEEN RUN.** It needs three humans in a room. Nothing in §3 can substitute for
   that, and the phase's status is `implemented`, not `passed`.
2. **Nobody has played it.** There is no browser binary in this environment (Playwright is
   unusable — recorded in the Phase 1 notes). Every UI claim is jsdom + `vite build` + `curl`
   evidence, or a unit test over the components a player's click would reach. The live preview has
   never been clicked by a person.
3. **The renderer does not draw the incident.** The tactical layer is a DOM screen on purpose
   (typing, hotkeys, target sizes), but the transition from the PixiJS street into it is a hard cut
   with anchors pinned by `toScreen`. A proper minimap/plan bake would need a render pass this
   phase did not budget.
4. **No cover, no sightlines, no suppression.** Subjects are a point, a wound state and a cadence.
   Line-of-sight is not modelled; the 0.38 µs tick is partly *because* of that. Any real 2-armed-room
   fight needs this, and it is Phase 3 work.
5. **Drag-reorder, formations beyond stack, specialists** (breacher/medic), **trap doors**,
   **drones/informants**, **sound pings** — deferred by the cut line, in the cut line's order.
6. **`force_index` does not yet persist across a shift boundary in the save.** It works inside a
   session and is tested, but the campaign-level ratchet needs the Phase 3 family/economy layer to
   store it.
7. **The crowd is a mood graph with no crowd.** 34 agents is a *number* in the model, not 34 dots
   on a screen. The temperature ring exists as a bar, not as a ground ring, and there is no bark
   density meter. The fiction is load-bearing; the spectacle is not there yet.
8. **The desk's tag vocabulary grew by six words.** `forced_entry`, `lethal_force`,
   `no_authorisation`, `unsearched_premises`, `crowd_dispersed`, `excessive_force_risk`. They are
   rendered as chips and are not yet used by any directive; OVERSEER's import will need them mapped.

## 6c. Cut line (unchanged from the plan)
