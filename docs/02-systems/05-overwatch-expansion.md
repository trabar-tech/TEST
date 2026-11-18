---
id: SYS-OVS-01
title: OVERSEER — Overwatch AI Expansion
status: draft
owner: design
depends_on: [SYS-REC-01, SYS-SIM-01, SYS-DIR-01]
consumed_by: [post-1.0]
updated: 2026-11-18
---

# SYS-OVS-01 · *OVERSEER* (expansion)

> **One-line:** the base game is about what you write. OVERSEER is about what you *believe* —
> and you are the only one who could have known better.

---

## 1. The user's objection, taken seriously

The brief raised the crux:

> *"It's implied that Overwatch is always watching and connected, so there wouldn't be a moral
> dilemma if it's watching you choose."*

Correct — **a panopticon can't host a privacy dilemma.** If the Overseer is omniscient, then
(a) every operator is already condemned, so choices are meaningless, and (b) the player has no
secret to keep, so there's no tension.

Our design does not patch this. It **relocates the dilemma**, and makes the relocation the
theme:

| Naive Overwatch game | OVERSEER |
|---|---|
| You see everything | You see **everything and understand nothing** |
| You decide who is guilty | You decide **which report to believe** |
| Surveillance = knowledge | Surveillance = **noise with timestamps** |
| Moral choice = spare or kill | Moral choice = **allocate attention** |
| The AI is the antagonist | **You are the AI, and you inherit your own lies** |

**Thesis sentence for the expansion:**
> *The regime's sin isn't surveillance. It's that surveillance can't see meaning, so it
> substitutes paperwork for understanding — and the Overseer is the paperwork.*

The dread comes from three mechanics, not from a moral slider:

1. **Latency.** Feeds arrive 8–30 s late. A crime you watch in real time already happened.
2. **Scarcity of attention.** 9 camera feeds, 4 squads, 2 drone bays, 1 shift. Every allocation
   is a neglect. Neglect is invisible until the after-action report.
3. **Auditability of the auditor.** Your own dispatch log is used against you in Act III.

---

## 2. What the player is

**Overseer-Candidate #7**, promoted off Kiln Row (the base-game save is imported). You are not
a body. You are:

- **A voice** in the wardens' radios (you literally speak the barks from the base game).
- **A cursor on the city map** (the macro view).
- **An archive** (your Case File, which you can browse and which the system uses).

You never walk. You never shoot. **You can, however, take manual control of a dispatched
squad** — see §6.4.

---

## 3. The city map layer (macro)

A single-screen city: 6 sectors × 5 blocks, with:

| Element | Meaning |
|---|---|
| **Camera nodes** | coverage; each can be tasked to a block, has a quality/reliability value |
| **Squad icons** | 4 squads, each with a live status (idle, en route, engaged, dark) |
| **Threat pins** | anomalies — some real, some false flags from biased reports |
| **Supply lanes** | canal, tram, truck; disruptions cascade to temperature |
| **Public sentiment** | a heat overlay per block; crowds may form |
| **Your feed panel** | 3 live thumbnails at a time (rotate manually — the others go unmonitored) |

**The attention mechanic:** you can *watch* only 3 feeds at once. Everything else is recorded for
later review, but "later" is a shift away. HYPOTHESIS: this single constraint is the expansion's
entire moral engine and should be the first thing prototyped.

---

## 4. Watch cycle (one loop, 20–30 min)

```
 ┌───────────┐   ┌────────────┐   ┌───────────┐   ┌──────────┐   ┌───────────┐
 │  ANALYSE  │──▶│  ALLOCATE  │──▶│  DISPATCH │──▶│  ASSESS  │──▶│ REPORT UP │
 │ read feeds│   │ squads/    │   │ watch it  │   │ what did │   │ your own  │
 │ flag      │   │ drones/    │   │ resolve;  │   │ wardens  │   │ record    │
 │ anomalies │   │ audits/    │   │ optional  │   │ report vs│   │ (auditable│
 │           │   │ curfews    │   │ manual    │   │ feeds    │   │ later)    │
 └───────────┘   └────────────┘   └───────────┘   └──────────┘   └───────────┘
       ▲                                                                │
       └───────────── consequences: temperature, audits, promotions ────┘
```

Each phase is 3–6 minutes. The **ASSESS** phase is where the base game's Record returns: you
receive warden reports with the same data shape as the player's own (`claim`/`truth`/`slack`),
except *you can now cross-check them against feeds* — and you can't check all of them.

---

## 5. Core mechanics (new)

### 5.1 Anomaly triage

Anomalies arrive as **pins** with a source (camera / warden / informant / citizen call) and a
**credibility score** derived from that source's history (which the base game generated — if you
lied a lot as a warden, warden reports are less credible *and* the system trusts them less,
which mirrors your own complicity).

Triage options: **ignore / task camera / dispatch squad / flag for audit / call the warden.**
Each has a time-and-attention cost. There is no "investigate everything".

### 5.2 Squad dispatch as a resource game

Squads have **competence** (from the named officers who served under you), **fatigue**, and
**loyalty** (their Legitimacy, personal). Sending a tired, low-loyalty squad into a crowded
block is how you generate a massacre you'll have to file.

**The cruelty:** the squads are *your former colleagues*. Their names appear. When one dies,
the radio goes quiet and the after-action form auto-fills.

### 5.3 Audits as a two-edged tool

You can order audits of wardens (to find lies and raise compliance) — but audits destroy trust,
and a warden who is audited stops reporting honestly, which blinds you. **You are optimising
your own sensor network by burning it.** This is the expansion's core loop.

### 5.4 Curfew / collective measures

Macro levers: curfew, ration cut, sweep, media message, amnesty. Each moves temperature and
Legitimacy across a whole sector, and each is a *ratchet* (same rule as the base game). You may
also *reverse* ratchets at high cost — the only way to end the expansion without a bloodbath.

### 5.5 The Record you inherit

Your base-game Case File is loaded as the **ground-truth layer**:
- Lines you lied about are still believed by the system (you must now defend them).
- A family you protected exists in the city; you can keep protecting them (quietly) or use them.
- A witness you silenced has a "missing person" file that surfaces as an anomaly.
- Wardens you served with quote your own reports back at you.

**This is the payoff of building the Record as data in Phase 1.** Without it, OVERSEER is just a
strategy game. With it, it's *your* bureau.

---

## 6. The moral design (explicit answers, because the brief asked)

### 6.1 Where's the dilemma if you're always watched?

There is none *about being watched* — and the game says so early, in a scene where a superior
tells you: *"The Eye doesn't judge you. It files you."* The dilemmas are:

| Dilemma | Mechanic |
|---|---|
| **Whose account do I trust?** | two sources, both biased, one feed, one shift |
| **Who do I leave unwatched?** | 3-feed cap; neglect surfaces in after-action |
| **Do I correct the record?** | correcting exposes a warden (and your own past) |
| **Do I hide the massacre?** | filing honestly costs the Directorate's trust; lying costs the city |
| **Do I audit a friend?** | audits find truth but blind the network |
| **Do I take manual control?** | competence vs. a micromanagement flag that damages Standing |

### 6.2 The twist (Act III)

A Directorate inquiry opens into *your* dispatch decisions, using your own logs. The final act is
played in **the base game's Night Desk UI** — you are filing a report about yourself, with the
same tools, the same exposures, and the same cracks in the archive. The expansion ends where
the base game lived: **a form, a stamp, and a choice about what the city believes.**

Endings (4): **Confirmed** (you become permanent infrastructure), **Replaced** (the Eye finds a
cheaper candidate), **Redacted** (you erase your own archive and vanish — the only selfless act
available to a system), **Recursive** (you file yourself as a resistance-linked anomaly and the
city inherits your logic).

### 6.3 Tone guard

OVERSEER must not become a power fantasy. Guard: **no unit ever gets stronger**, the map never
gets bigger, and the only progression is *more information* — which immediately creates more
ways to be wrong. The player ends better informed than they began, and no happier.

### 6.4 Manual control (the bridge back)

Any dispatched squad can be taken over, dropping into the base game's tactical layer for that
scene. Cost: a **Micromanagement flag** (+1 per manual control; at 3, a Standing penalty and a
directive questioning your "delegation"). Rationale: the base game's best verb becomes an audited
privilege — familiarity rewarded, indulgence punished.

---

## 7. Technical requirements (why the base game must anticipate this)

| Requirement | Base-game obligation |
|---|---|
| Record as queryable data | ADR-0002; `ReportLine` schema stable & serialisable |
| Tactical scenes reusable headless | tactical layer must expose a **simulate-without-rendering** API (dispatch resolves in seconds) |
| Deterministic clocks | seeded sim, save-safe (SYS-CORE-01) |
| Declarative content | all incidents/maps as JSON with stable IDs |
| Named NPC persistence | squad officers persist with traits & history |

Estimated build: **+60–70% of base-game production**, mostly content and UI, cheap in new
engineering *if* the five obligations above are met on day one. If they aren't, OVERSEER is a
rewrite — which is the single strongest argument for building the Record first.

---

## 8. Scope & cut lines for the expansion

**In:** 6 sectors, 4 squads, 3-feed cap, anomaly triage, audits, curfew/amnesty levers, imported
Case File, Act III self-inquiry, 4 endings.

**Out:** city-building, economy of buildings, any 4X layer, multiplayer, modding API (post-1.0
maybe), voice acting (text-radio only).

**HYPOTHESIS to test first:** a 20-minute "frozen watch cycle" prototype (one sector, 3 feeds,
2 squads, 4 anomaly pins, no art) — if the attention economy isn't tense there, the expansion
doesn't work and we cut it early (P7-T01, a go/no-go gate).

---

## 9. Acceptance checks (for the expansion's own milestone)

1. A player can complete a watch cycle with all outcomes derived from the imported Case File.
2. Neglect is attributable: the after-action report names the block you weren't watching.
3. Auditing a squad measurably reduces that squad's future report quality (not just its loyalty).
4. Manual control never becomes strictly optimal (the flag must bite within 3 uses).
5. Filing the Act III self-report offers all 4 endings, purely from accumulated data.
