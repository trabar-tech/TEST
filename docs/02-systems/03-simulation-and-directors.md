---
id: SYS-SIM-01 / SYS-DIR-01
title: Sector Simulation & Directors
status: draft
owner: design
depends_on: [SYS-REC-01, SYS-INDEX]
consumed_by: [phase-3, src/sim/sector, src/sim/directors]
updated: 2026-11-18
---

# SYS-SIM-01 · Sector Simulation

## 1. Design goal

Produce the feeling of *a city that has opinions about you* using ~400 abstracted citizens,
60 household records, 4 factions, and a single temperature scalar — at a cost small enough to
run in a browser tab between shifts (target: **< 15 ms** per shift tick).

The sim is **not** an agent simulation of a city. It is a **belief-and-pressure machine** that
occasionally materialises agents for the tactical layer.

---

## 2. Data model

```json
{
  "sector": "kiln_row",
  "shift": 7,
  "temperature": 46,
  "force_index": 12,
  "supply_deficit": 0.18,
  "surveillance": { "cameras_online": 9, "cameras_total": 12, "drone_hours": 2 },
  "households": [
    { "id": "h-014", "block": "tenement_row", "members": 3, "ration_class": "C",
      "housing": "secure", "loyalty": 0.4, "secret": "unlicensed_printing",
      "flags": ["flagged_shift_4"], "grievance": 0.6 }
  ],
  "factions": {
    "cell":       { "antagonism": 2, "strength": 0.35, "plan": "arm_cell_2", "safehouse": "printery_b" },
    "syndicate":  { "antagonism": 1, "strength": 0.55, "plan": "open_canal_route" },
    "congregation":{ "antagonism": 0, "strength": 0.25, "plan": "hide_the_sick" },
    "civil_protection": { "antagonism": 1, "cohesion": 0.6 }
  },
  "belief": { "resistance_estimate": 3, "brutality_index": 8, "grievance_count": 11 }
}
```

`belief` is written by SYS-REC-01 from the player's *claims* — never from truth.

### 2.1 The 12-known-faces rule (research R-1)

Adapted from RimWorld's apophenia budget: the player can hold ~a dozen people in their head, and
a cast larger than that *dilutes* memory rather than enriching it.

- **Known citizens:** max **12** at any time — named, portraited, with a one-line history that
  the Registry tracks. These are the people who can wound the player emotionally.
- **Records:** the other ~48 households exist as registry entries, materialising into Known
  status only when the player interacts meaningfully with them (2+ interactions, or a filed line
  naming them, or a faction link).
- **Eviction from the Known set is a feature:** a household that is moved on, dies, or goes
  silent leaves a *gap*, and the player notices the roster shrinking. That is the cheapest
  emotional beat in the game.

HYPOTHESIS: 12 is the right cap at 15 shifts. Test at G2 by asking testers to name three
citizens unprompted.

### 2.2 Grudges are records, not rivals (legal boundary — research R-6)

A grudge is a **record with a cause**: `{citizen_id, cause_line_id, intensity, decay_rule,
satisfying_actions[]}`. It changes disposition, dialogue and the odds of that person appearing in
an incident. It **never** generates a scarred returning nemesis, and there is no enemy hierarchy
that promotes anyone based on encounters with the player.

Read `06-research/01-director-ai-anatomy.md` §6 before touching this system: the Nemesis system is
patented, and "the game is growing a rival" is the line we do not cross.

---

## 3. Per-shift update (deterministic, seeded)

```
1. supply      → supply_deficit   += (directive cuts) - (player-arranged relief)
2. beliefs     → read SectorBelief from last night's report
3. factions    → each advances its plan; successful plans mutate the sector
                 (cell: +strength if resistance under-reported; syndicate: +route if
                  confiscations low; congregation: +loyalty if curfew unenforced)
4. households  → loyalty += f(grievance, ration class, arrests of neighbours, notices)
                 flagged households may flip (become informants, or flee, or host the Cell)
5. temperature → formula below; clamp 0..100
6. directors   → run, produce incident deck + directives (SYS-DIR-01)
7. persist     → write save; seed next shift's RNG from hash(save)
```

```
temperature = 0.50*(100 - legitimacy)
            + 0.20*(force_index / max_force) * 100
            + 0.15*(supply_deficit * 100)
            + 0.15*(faction_heat * 100)

legitimacy  = mean(household.loyalty) * 100 - grievance_pressure
```

**Why a scalar:** one number is what makes the ratchet legible to the player through the
*world* (colour grade, barks, crowd density, empty streets), not through a meter. The player
learns to read it like weather.

---

## 4. Agent materialisation (the bridge to tactics)

When the tactical layer needs people, the sim **materialises** agents from household records:

```
materialise(household_id) → Agent {
  name, face_seed, temperament,      // derived deterministically from household
  papers: {class, permit, pass},     // may contain a *real* irregularity
  knowledge: [secret?, faction_link?, player_grudge?],
  routine: template + household modifiers
}
```

Consequence: **the person you arrest on Tuesday is the mother from the flat you cleared on
Monday.** Continuity is cheap (deterministic seeds) and expensive in meaning. This is the
highest-value 200 lines of code in the project — prioritise it in Phase 3.

---

# SYS-DIR-01 · Directors

> **Architecture decided in `05-decisions/ADR-0004`. Read it plus `06-research/` before editing
> this section.** In one line: a director is a **weighted storylet deck plus a small scoring
> function**, the Arbiter is a **4-state pacing FSM**, the Cell uses **HTN-lite authored plans**,
> and the Eye is **a gauge, not a planner**.

## 5. Why three, not one

The brief asked for an Alien-Isolation-style director. That model — one invisible intelligence
hunting the player — is wrong here: it centres the player in a world that should feel
indifferent. Research confirmed this is not a matter of taste: Isolation's director exists to
push danger toward the player, and every one of its outputs assumes the monster is the story.
Ours must assume the *city* is the story. Instead: three directors with **different models of
the player**, plus a neutral pacer. *(Full anatomy: `06-research/01-director-ai-anatomy.md` §1.)*

| | **The Desk** (Pressure) | **The Cell** (Insurgency) | **The Eye** (Overwatch) |
|---|---|---|---|
| **Knows** | the player's record, Integrity, unused content | Legitimacy, informant net, crackdown history | coverage, detections, audits |
| **Wants** | thematic testing: put the player in a scenario that probes their fault line | win: recruit, arm, strike | see: close coverage gaps, escalate monitoring |
| **Produces** | incident deck, daily directives, quota | sabotage, ambush, propaganda, safehouse moves | forced audits, drone overflights, checkpoint demands |
| **Fails when** | player disengages (skipping Beat) | over-uses force (too visible) | sector goes dark (cameras down) |
| **Player counter** | play the role; file consistent reports | reduce Legitimacy damage; burn informants | keep audits clean; disable cameras |

**Their disagreement is the content.** Example: the Cell plants a bomb rumour; the Eye demands
a sweep (which terrifies the street); the Desk issues a daily directive requiring *public
reassurance* patrols. The player cannot satisfy all three. That's a shift.

## 6. The Desk's fault-line targeting

The Desk maintains a **fault-line vector** from the player's behaviour:

```json
{ "brutality": 0.7, "leniency": 0.1, "honesty": 0.3, "corruption": 0.5,
  "family_pressure": 0.4, "loyalty_to_squad": 0.8 }
```

Incident cards are tagged with the fault lines they probe. The Desk weights the deck toward
tags near the player's *highest* values **and** occasionally toward their *lowest* (to test
whether it's a genuine value or just a habit). Budget: max 1 "probe the opposite" per 3 shifts.

**Anti-monotony rules (the Arbiter):**
- No incident archetype twice in 3 shifts.
- ≥ 1 quiet scene per shift (a Beat with no violence).
- ≤ 2 armed incidents per shift; ≤ 1 lethal-authorisation scene per 2 shifts.
- If temperature > 70, force at least one *de-escalation opportunity* per shift (a faction
  offer, a supply run, an amnesty directive). **The game must always offer a way back — it may
  be ugly and expensive, but it must exist.**

### 6.1 The Desk as a deck, mechanically (ADR-0004)

```
candidates = storylets where prerequisites(player, sector, shift) are satisfied
score(s)   = novelty(s)            // 0 if archetype seen in 3 shifts, 1 otherwise
           × fault_alignment(s)    // |dot(s.fault_lines, player.fault_vector)|, clamped
           × pacing_fit(s, arbiter.state)   // calm wants quiet cards, peak wants pressure
           × temperature_fit(s)
           × 0.15 + 0.85        // floor, so nothing is ever impossible — only unlikely
deck       = weighted sample of k candidates; k = 3 at calm, 2 at peak
```

Four numbers, one product, one floor. If this needs a fifth factor, add a director instead.

### 6.2 The Arbiter's pacing FSM (L4D borrow — research §2)

| State | Enters when | What it permits | Exits when |
|---|---|---|---|
| **CALM** | shift start, or 1 shift after release | quiet micro-events, directives, family scenes; no armed incidents | 3+ storylets consumed, or temperature > 60 |
| **BUILD** | 1 quiet scene played | 1 armed incident max, rising pressure barks | player commits force, or a faction plan completes |
| **PEAK** | an incident is dispatched | no new incidents; the scene is the scene | incident resolved |
| **RELEASE** | after any lethal/collective force or a death | forced quiet content, Overwatch commentary, no threats for 1 shift | next shift start |

The FSM is ~80 lines and owns **budgets, not content**. This is the single most important
structural lesson from *Left 4 Dead*: pace with a small machine, fill with a big deck.

## 7. The Cell's plan engine (HTN-lite — research §3)

Three-shift plans as small state machines, so the insurgency feels *purposive* rather than
random:

```
plan: arm_cell_2
  shift 1: procure  — needs a safehouse with low surveillance
  shift 2: recruit  — picks a household with grievance > 0.6
  shift 3: strike   — produces an incident card: "checkpoint bombing"
  failure: if the player burned the safehouse or arrested the recruit → plan resets,
           antagonism +1, and a *grudge* is recorded against the player by name
```

**The player can read these plans** if they invest in informants — turning the director into a
puzzle rather than a slot machine. This is the core "surveillance pays off" loop.

## 8. The Eye's escalation ladder

| Detections in 3 shifts | Response |
|---|---|
| 0 | passive: cameras only |
| 1–2 | drone overflight (adds recon, raises dread) |
| 3–4 | checkpoint demand (a forced tactical scene) |
| 5+ | forced audit + a "Compliance Review" of the *player* |

The Eye is **not** adversarial to the player by nature — it's adversarial when it can't see.
**Giving the Eye information (honest reports, camera repairs) buys you freedom.** That trade is
the moral texture of Act II: the price of autonomy is transparency to the regime.

### 8.1 Oversight Attention — the menace gauge, re-purposed (research R-2)

Isolation's menace gauge measures *how afraid the player should be*. Ours measures **how closely
the Eye is watching the player**, which is a different and more bureaucratic kind of pressure.

```
attention = 0.35 * camera_coverage_over_player
          + 0.30 * recent_contradictions_in_report   (0..1, decays 20%/shift)
          + 0.20 * proximity_to_known_cell_activity
          + 0.15 * (1 - filing_speed_percentile)     // slow, careful filers look nervous
```

| Attention | Player experience |
|---|---|
| 0–25 | invisible; the radio is quiet; requisitions approved |
| 26–55 | occasional check-ins; audits are stricter on *force* discrepancies |
| 56–80 | Overwatch comments on your patrols; a drone shadows you; family is asked about you |
| 81–100 | a **Compliance Review** is scheduled; every filed line is re-read; your squad is told |

**Two uses, both free of scripting:**
- **Relief:** clearing attention is *legitimate* play — file honestly, repair cameras, complete a
  quota. The player learns that visibility to the regime is a currency they can spend down.
- **Weaponisation:** high attention on a *rival warden* (by contradicting their record, or
  reporting their conduct) discredits them before an inquiry. Act III politics.

**Design guard:** attention must never be a hidden fail-state. The player can *infer* it from
radio chatter density, drone presence and the tone of Overwatch's lines — and after Act II, from
the Registry. Never a numeric meter on screen (same rule as Legitimacy).

HYPOTHESIS: `filing_speed_percentile` may read as punishing careful players. Test at G1; if it
does, replace that term with `unresolved_field_notes`.

## 9. Acceptance checks

1. Running 10 shifts with a fixed seed and no player input produces a monotonically rising
   temperature curve and a coherent incident history (no contradictory world states).
2. A faction plan can be discovered by an informant purchase and prevented by a tactical action.
3. The Desk never produces the same archetype twice in 3 shifts (assert in test).
4. Sim tick cost < 15 ms for 60 households on the reference machine.
5. A materialised agent's papers match their household record (no impossible citizens).
6. **Arbiter budgets hold for 50 consecutive simulated shifts** (≤2 armed, ≥1 quiet, no repeat
   in 3, de-escalation offer above temperature 70).
7. **Every director decision is traceable**: `debug:bus` shows candidates, scores and the chosen
   reason. A director emitting no score data fails code review.
8. **Oversight Attention never surprises:** a player who files honestly and completes quota sees
   attention fall within 2 shifts, and can name why (cameras / honesty / quota).
9. **The 12 Known cap holds**: at no point can the player have more than 12 named citizens in the
   Known set; a materialised record promoted to Known demotes the oldest untouched one.
10. **No nemesis drift**: a grudge changes disposition and encounter odds only; it never creates
    a returning antagonist with authored traits. (Reviewed against `06-research/...§6`.)

## 10. Open questions

- Q1: Is 60 households enough to feel like a district? (May need 120 abstracted-but-linkable.)
- Q2: Should the Eye ever be *wrong* in a way that hurts the player, with an in-fiction apology?
  (Leaning yes — one scripted miscarriage of justice per act, to teach that the machine is not
  your friend.)
- Q3: Do we surface the fault-line vector to the player at all? (No — but the Case File should
  make the pattern visible in hindsight.)
- Q4 (new, from research): does the 12-Known cap survive Act III, when the player may need to
  reference more names? Options: raise to 16, or let the Case File *search* substitute for
  memory. Leaning: raise to 16 and accept dilution as a cost of power.

## 11. Research provenance

Sections 2.1–2.2, 5, 6.1–6.2 and 8.1 are derived from `06-research/` and locked by ADR-0004.
If you change them, update the research ledger's adopted/rejected table (`06-research/00-index.md`
§2) so the trail stays intact.
