---
id: SYS-ECON-01
title: Progression & Economy
status: draft
owner: design
depends_on: [SYS-REC-01, SYS-TACT-01]
consumed_by: [phase-2, src/sim/economy]
updated: 2026-11-18
---

# SYS-ECON-01 · Progression & Economy

## 1. Design principle

**Power is purchased with visibility.** Every upgrade has an audit weight. The player is never
offered a strictly-better option; they are offered a *more effective and more exposed* option.
Any upgrade that is purely better is a bug in the design, not a reward.

Second principle: **the household is the pressure valve.** Career progression is abstract;
rent is not. When players say "I need to hit quota", the number they actually mean is `72 FP`
for the flat.

---

## 2. Currencies (full spec)

| Currency | Code | Earned | Spent | Persistence |
|---|---|---|---|---|
| Standing | `std` | quotas (+0.5/inspection, +2/shift quota met), clean audits (+1), denunciations (+1) | rank, gear access, cover-ups (−3), amnesty (−5) | campaign |
| Requisition | `rp` | 3 + rank, +2 if quota met | gear, specialists, drone charges | per shift (70% wasted) |
| Ration | `fp` | wage = 8 + rank*2, minus deductions | rent 30, food 22, medicine 15, incidentals | campaign (debt allowed) |
| Intel | `it` | interrogation (1–2), informant (1/day) | recon, incident cards, leverage | expires in 2–3 shifts |
| Slack | — | lies | protection, extortion | implicit, per line |

**Why RP resets:** use-it-or-lose-it forces a meaningful loadout decision every shift instead of
hoarding, and it keeps the economy from inflating in a 15-shift campaign.

**Why FP doesn't reset:** debt is the only long-horizon pressure the player can't out-skill.

---

## 3. Rank table

| Rank | Tier | Shift gate | Daily quota (inspections / detentions / patrol-min) | Squad | RP | Wage | Unlocks |
|---|---|---|---|---|---|---|---|
| Warden 3rd | 1 | 1 | 25 / 3 / 20 | 0 | 3 | 10 | — |
| Warden 2nd | 2 | 3 | 32 / 5 / 25 | 0 | 4 | 12 | Field Note, Search |
| Warden 1st | 3 | 6 | 40 / 8 / 30 | 1 | 5 | 14 | Squad Comms, home entry |
| Inspector | 4 | 9 | 48 / 12 / 40 | 2 | 6 | 17 | Raid authorisation, advanced interrogation |
| Section Lead | 5 | 12 | 55 / 15 / 45 | 4 | 8 | 21 | Drone tasking, audit override, denounce |

> **⚠ Arithmetic contradiction, recorded 2026-11-18.** The wage formula above
> (`8 + rank × 2` → 10 FP at rank 1) and the §6.1 nightly bill (rent 30 + food 22 + medicine
> 15 = **67 FP**) cannot both be right: every rank is insolvent on night one, and a single
> missed night exceeds the −60 debt floor. The §3 table's own rank-5 wage (21) also disagrees
> with the formula (18). The ledger is built and tested against this spec but deliberately
> **not wired into the game** until the scale is decided — see
> [`03-production/phases/05-phase-4-entry.md`](../03-production/phases/05-phase-4-entry.md) §4
> for measurements and three candidate fixes.

**Promotion rule:** `std >= threshold(tier)` and `reviews_in_last_3 == 0` and at least one
*favourable* audit. Promotion is **granted at briefing**, in fiction, by a superior — it feels
like being handed a heavier coat. Demotion exists and is worse than death for the player's
self-image.

**The cruel design detail:** quotas rise faster than the sector's ability to supply violations,
so by Act III the player *must* generate infractions or fail — and generating them is what
raises temperature, which makes incidents harder, which burns more Standing. The economy is a
ratchet in narrative clothing. Tune this last; it is the whole difficulty curve.

---

## 4. Perks (directorate-recognised competencies)

Max 4 equipped; each is a *label on your file* that audits can see.

| Perk | Effect | Audit cost |
|---|---|---|
| Paperwork Discipline | auto-fills 1 correct field per form | — (this is the "honest" perk) |
| Street Ear | +1 informant slot | +1 scrutiny on informants (they're a liability) |
| Heavy Hand | rung-2/3 tools cost 1 less RP | rung-3 actions flagged to the Eye |
| Bent Stamp | forge 1 document/shift (passes/cites) | forging caught = immediate Review |
| Clean Record | −25% slack detection on lines you signed honestly | must maintain honesty streak |
| Squad Anchor | squad keeps queue under fire | squad requests more authorisations |
| Family Man | household costs −20% | Directorate notes "divided loyalties" (promotion gate harder) |
| Confessor | quarterly amnesty: erase 2 slack from the archive | you must confess *something real* first |

Perks are **respeccable only by demotion**. Choices stick.

---

## 5. Requisition catalogue

| Item | RP | Audit wt | Notes |
|---|---|---|---|
| Stun baton | 2 | 1 | standard |
| Crowbar | 1 | 0 | quiet breach of `barred` (slow) |
| Door ram | 2 | 1 | fast, loud |
| Riot line kit | 5 | 2 | crowd containment |
| Gas canister ×2 | 4 | 3 | collateral risk |
| Drone charge ×1 | 5 | 0 | recon one room |
| Camera access (shift) | 3 | 0 | 2 fixed feeds |
| Sidearm suppressor | 6 | +2 on use | silent kill; creates a "missing person" mystery that the sim pursues |
| Medical kit | 3 | 0 | stabilise downed (incl. hostiles → witness) |
| Bribe fund | 3 | 0 | 40 FP of untraceable "goodwill" (also: syndicate leverage) |

**Suppressor note (important):** it does not delete the consequence, it *changes its shape*.
A body with no bullet becomes a disappearance, which becomes a Cell recruitment story, which
becomes an incident. The most "efficient" tool is the most narratively expensive.

---

## 6. Household economy

### 6.1 Nightly ledger (max 4 line items — hard cap)

| Line | Cost | Consequence of non-payment |
|---|---|---|
| Rent | 30 FP | notice → eviction (3 shifts) → family relocated → Integrity collapse |
| Food | 22 FP | family health ↓, child scenes turn hostile |
| Medicine (conditional) | 15 FP | spouse's condition worsens (Act II plot) |
| Rotating need | 8–25 FP | school permit / stove part / debt to a neighbour |

**Income:** `wage(rank) − penalties − unnoticedBribesThatGotNoticed`.
**Debt:** allowed to −60 FP. At −60, the Syndicate's offer becomes non-optional (a hard,
authored scene).

### 6.2 The borrow tree (when short)

1. **Take a bribe** (this shift): +25–60 FP, −Integrity, one report line you must lie about.
2. **Sell requisitioned gear** to the Syndicate: +RP-equivalent FP, loses capability, sets a
   flag that the quartermaster *will* notice in 2–3 shifts.
3. **Borrow from the Syndicate:** +50 FP now, called in as an incident within 4 shifts.
4. **Let rent slip:** no immediate cost, delayed consequences, Integrity hit when the child asks.

Each branch is a *content thread*, not a stat. That's the difference between an economy and a
menu.

---

## 7. Meta-progression & replay

- **Case File** persists per save and is browsable (the game's memory).
- **Continuing Service** (post-campaign endless): procedural quotas at your final rank,
  persistent sector, no ending — for players who want the job.
- **New Game+ "Known Quantity":** restart at Act III with the Directorate already suspicious;
  your previous Case File is *read aloud* by the Overseer as evidence. Cheap to build (it's all
  data we already store), high emotional payoff.

---

## 8. Acceptance checks

1. A player who never lies can afford rent in Act I and *barely* in Act II (tune to fail ~30% of
   the time if they also refuse bribes and take no risks).
2. No two gear items dominate: for each item there is a scenario where a cheaper item is better
   (assert via a design review checklist, not code).
3. Negative FP is always recoverable within 2 shifts via at least one available path.
4. Rank promotion is never a pure stat upgrade: every tier adds a verb.
5. The nightly ledger takes < 20 seconds to resolve for a decisive player.

## 9. Open questions

- Q1: Is 15 shifts the right length for an economy with this many reset-on-shift currencies?
- Q2: Should quotas be visible as exact numbers or as "directorate expectation" ranges?
  (Currently exact — legibility wins, and the dread comes from the number being *reachable*.)
- Q3: Does the family layer risk becoming a nag? Guard: family scenes are *reactive to the day*,
  never generic reminders.
