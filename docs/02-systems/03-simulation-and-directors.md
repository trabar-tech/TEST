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

## 5. Why three, not one

The brief asked for an Alien-Isolation-style director. That model — one invisible intelligence
hunting the player — is wrong here: it centres the player in a world that should feel
indifferent. Instead, three directors with **different models of the player**, plus a neutral
pacer.

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

## 7. The Cell's plan engine

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

## 9. Acceptance checks

1. Running 10 shifts with a fixed seed and no player input produces a monotonically rising
   temperature curve and a coherent incident history (no contradictory world states).
2. A faction plan can be discovered by an informant purchase and prevented by a tactical action.
3. The Desk never produces the same archetype twice in 3 shifts (assert in test).
4. Sim tick cost < 15 ms for 60 households on the reference machine.
5. A materialised agent's papers match their household record (no impossible citizens).

## 10. Open questions

- Q1: Is 60 households enough to feel like a district? (May need 120 abstracted-but-linkable.)
- Q2: Should the Eye ever be *wrong* in a way that hurts the player, with an in-fiction apology?
  (Leaning yes — one scripted miscarriage of justice per act, to teach that the machine is not
  your friend.)
- Q3: Do we surface the fault-line vector to the player at all? (No — but the Case File should
  make the pattern visible in hindsight.)
