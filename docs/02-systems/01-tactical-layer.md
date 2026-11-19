---
id: SYS-TACT-01
title: Tactical Layer — RTwP, Force Continuum, Breach & Crowds
status: draft
owner: design
depends_on: [SYS-CORE-01, SYS-INDEX]
consumed_by: [phase-2, src/sim/tactical]
updated: 2026-11-18
---

# SYS-TACT-01 · Tactical Layer

**Problem it solves:** the Beat is slow and verbal; the Incident is fast and spatial. The
transition must feel like *the same game changing register*, not a genre switch. One timescale
engine, one order vocabulary, one vocabulary of consequence.

---

## 1. The timescale engine

There is **one clock** with a `timescale` multiplier. Everything else is a mode of that.

| Mode | timescale | Enter | Exit | Cost |
|---|---|---|---|---|
| **Patrol** | 1.0 | default on the Beat | any incident | — |
| **Pause** | 0.0 | `Space` | `Space` / `Esc` | free, unlimited |
| **Plan** | 0.15 | automatic while dragging a queued order | release | free |
| **Focus** (solo slow-mo) | 0.35 | `RMB` held, **requires 0 attached squad** | release / stamina 0 | 6 s budget, 9 s recharge |
| **Brief** (scripted) | 0.0 | briefing screens | click | — |

**Design consequence (the brief's RTwP question):**
- If you *have* a squad → **Pause orders troops.** The game is Door Kickers: queue, execute, watch.
- If you have *no* squad → Pause still exists, but it is *cheap and dull*; **Focus** is the real
  tool. At 0.35× you can see the room, dodge, aim, and commit. It is not "bullet time" as
  power fantasy — the world is only 3× slower and you are still fragile.
- **Both share the same order vocabulary**, so learning one teaches the other. This directly
  addresses the "two games stapled together" risk (GDD §8, unknown 4).

**Rule:** Focus is *disabled* when a squad is attached, and Pause is *discouraged* (a small
Comms-latency penalty: orders issued while paused take +0.4 s to acknowledge when a squad is
present, so real-time "quick chat" ordering is genuinely better). This keeps the two modes
from being strictly-dominant versions of each other.

TBD-HYPOTHESIS: 0.35 / 6 s / 9 s ratios. Owned by task `P2-T03`.

> **As built (2026-11-18), and the one thing this table got wrong.** The 0.35 ratio
> was implemented as a *movement* multiplier first, and measured: it passed the
> original acceptance test ("a 2-hostile room is survivable ≥50%") **vacuously** —
> with a 2.2 s enemy cadence the player was never in the room long enough to be hit,
> so the metric was true for a reason that had nothing to do with Focus. It is a
> **timescale**: the world runs at 0.35×, the player's hands do not, and the thing it
> buys is the real seconds in which a plan gets issued. `Incident.noteAction()`
> charges 0.7 sim-seconds per deliberate action (0.245 under Focus), which is where
> the two clocks actually meet — and it is what the honest test measures.
> Pause is *not* available inside an incident, so the "cheap and dull" tradeoff above
> is currently expressed as "Focus or nothing", which is a smaller design than the
> table promises. That is a G1 question, not an implementation bug.

---

## 2. Order vocabulary (shared by squads and the solo player)

Eight verbs, 8 hotkeys, all radial-accessible, all with voice lines.

| Key | Order | Squad meaning | Solo meaning |
|---|---|---|---|
| `1` | **Hold** | hold position, watch a facing | stand still, ready stance |
| `2` | **Move** | move in formation to point | walk/run to point |
| `3` | **Stack** | stack on door/side (auto-slot) | take cover on a corner |
| `4` | **Breach** | open door by current method | force a door |
| `5` | **Clear** | enter + clear assigned sector | enter + focus sightline |
| `6` | **Detain** | move to cuff target | cuff target |
| `7` | **Escalate** | step up one force rung (needs authorisation above 3) | same |
| `8` | **Regroup / Withdraw** | fall back to rally | disengage to cover |

**Comms rule (the "quick chat" requirement):** orders are issued by hotkey + cursor, with a
**voice confirmation**. Issuing 3+ distinct orders within 5 s while **unpaused** triggers
**Flow**: +20% squad movement-to-order speed for 8 s. Flow exists to reward real-time
commanding; without it, everyone pauses and the RT half of RTwP dies.

**Order queue:** each unit holds up to 4 queued orders; visible as a small icon strip. Queued
orders can be reordered by dragging. **Queued orders are cancelled by contact** (a unit that
takes fire/aggro drops its queue and goes to `Hold` + self-preservation), unless it has the
`Disciplined` trait.

---

## 3. Information gating (what you can see)

The tactical layer refuses omniscience. Three information sources, each a spendable resource:

| Source | Coverage | Duration | Cost | Fails when |
|---|---|---|---|---|
| **Direct sight** | line of sight of your units | always | — | walls; you can't see through doors |
| **Sound pings** | rooms within 2 walls of a noise | 3 s ping | noise events are free but loud | silent rooms are blank |
| **Camera feed** | 2 fixed cameras (requisition or hack) | whole scene | 3 RP / a hack action | vandalised cameras (the Cell does this) |
| **Drone** | 1 room, 8 s | 1 charge/scene | 5 RP | shot down by armed lookouts |
| **Informant plan** | floor plan + "2 armed upstairs" | whole scene | 1 intel token | stale if >2 shifts old; sometimes wrong by design |

**Rendering rule:** unknown rooms are rendered as *architectural silhouettes* (walls only, no
contents). The player always knows the *shape* of a building (they're a local officer) but
never the *contents*. This is the readability/uncertainty compromise: the map is fair, the
situation is not.

HYPOTHESIS: silhouettes reduce frustration vs. full fog-of-war. A/B in playtest P2.

---

## 4. Doors, breaches & the entry catalogue

### 4.1 Door state machine

```
          ┌────────┐  ram/kick   ┌────────┐
          │ LOCKED │────────────▶│  OPEN  │
          └───┬────┘             └────┬───┘
   pick     │                        │ wedge
   ┌────────▼────────┐               ▼
   │   BARRED        │         ┌──────────┐
   │ (needs crowbar/ │         │  WEDGED  │ (you blocked it: safe rear)
   │  ram + 2 hands) │         └──────────┘
   └────────┬────────┘
            │ shotgun (lethal breach)
            ▼
      ┌──────────┐   tripwire discovered → TRAPPED
      │  AJAR    │───────────────────────────▶ (blast/gas on entry)
      └──────────┘
```

Every breach generates: a **noise event** (radius per method), a **damage number** (feeds
report `damage` field), and a **time cost**. The *quiet* options are slow, the *fast* options
are loud and expensive in paperwork. That is the whole design of the door.

> **As built (2026-11-18).** The catalogue below is now data in
> `src/systems/tactical/doors.ts` and its numbers were tuned to make the *ordering*
> true rather than decorative: noise strictly ascends from knock & talk (2 tiles) to
> shotgun (13), and each method carries a **wall count** it penetrates at all. The
> wall count replaced a pure damping coefficient after a shotgun in a rear room
> proved inaudible from the street — a model that silently told the player walls
> defeat sound, which would have made the noise→paperwork link a lie. Knock reaches
> zero walls; a ram two; a shotgun three.

### 4.2 Entry types

| Entry | Time | Noise | Officer risk | Legitimacy | Best when |
|---|---|---|---|---|---|
| **Knock & talk** | 20–40 s | low | low | **0** | unknown occupant, low heat |
| **Stack & enter** (2+) | 4 s | med | med | low | known hostile, one room |
| **Split entry** (2 doors) | 6 s | med | med | low | 2+ rooms, need to deny escape |
| **Roof / window** | 12 s | low | high | 0 | front is watched |
| **Ram** | 3 s | **high** | low | med | barred, fast needed |
| **Shotgun** | 2 s | **very high** | low | **high** | desperate, or signalling |
| **Gas & wait** | 60 s | med | **very low** | **very high** | armed, entrenched, no hostages |
| **Shout out** | 15 s | low | med | 0 | heat low, they'll comply |

**The catalogue is the strategy.** A skilled player reads the room and picks the entry that
minimises *recorded force*, not the one that minimises risk. That inversion is the game.

### 4.3 Room clearing (sector logic)

- Each room is divided into **sectors** (corners + centre). Clearing = all sectors assigned and
  visually confirmed by a unit.
- A cleared room stays clear unless a door is un-wedged or a hostile re-enters.
- **"Clear" is a claim, not a fact.** If a unit reports cleared but a hostile is hiding in a
  wardrobe, the report is *wrong* — and that's a report line that can blow up in an audit.
  (This is the tactical layer leaking into the Record: the game of truth starts here.)

---

> **As built (2026-11-18).** Rungs, authorisation (4 s), wound model, executions
> (force on someone already down is flagged, and is the only provable statement of
> *intent* in a scene) and the ratchet are in `force.ts`, tested by
> `tests/tactical-force.test.ts`. The one-line rule is enforced as a test over all
> five rungs.

## 5. The force continuum (mechanical specification)

Each hostile/civilian has **compliance** (0–100) and **aggression** (0–10). Rungs act on these:

| Rung | Effect on compliance | Effect on aggression | Collateral risk | Log |
|---|---|---|---|---|
| 1 Presence | +8/s at <3 m if uniform visible | −0 | 0 | `presence` |
| 2 Control | +25 instant, +bleed | +1 if repeated | low | `control:{tool}` |
| 3 Compliance | +60 (area) | +3 | **med** (gas drifts, ram hits bystanders) | `compliance:{tool}` |
| 4 Lethal | target removed | +4 on all witnesses | **high** | `lethal:{weapon}` |
| 5 Collective | scene ends | **max** on sector | **very high** | `collective:{order}` |

**Authorisation:** rung 4+ requires a **Field Authorisation** (a radio call, 4 s, logged).
Using it without authorisation = automatic Compliance Review. In Act III, authorisations are
*granted too easily* — that's the horror.

**Wound model (kept deliberately coarse for a web build):**
`healthy → winded → wounded → down → dead`. Downed hostiles can be stabilised (medic) — and a
stabilised hostile is a **witness** with a grudge, not a corpse. Corpses are paperwork; witnesses
are story.

**Ratchet:** `force_index[sector] += rung_weight` persists across days (decaying 15%/shift).
Higher `force_index` raises sector temperature (SYS-SIM-01) and the chance that an incident
starts at a higher rung (people are armed and scared). **Suppression breeds resistance; the
mechanics make that literally true.**

---

> **As built (2026-11-18).** `src/systems/tactical/crowd.ts` implements the table
> below as a 7-action reducer over `heat` with hysteresis thresholds
> (chant 0.35 / surge 0.6 / riot 0.85). 34 agents cost **0.075 µs/tick** — the mood
> graph is deliberately not a simulation of 34 bodies, and that is the point of it.
> The ground ring is now a real ground ring (`drawCrowdRing` in `src/render/plan.ts`), drawn on
> the street so a crowd reads as weather rather than as a number in a modal.

## 6. Crowds

A crowd is a **mood graph**, not a physics simulation.

```json
{
  "id": "crowd:canal_market",
  "agents": 34,
  "heat": 0.22,
  "leaders": ["c-0117", "c-0240"],
  "grievance": "ration_cut",
  "state": "milling"   // milling | chanting | surging | scattering | riot
}
```

**State transitions** driven by `heat` + player actions:

| Action | Δheat | Δstate |
|---|---|---|
| Show presence, single voice | −0.05/s | mills down |
| Arrest a leader | +0.35 instant, then decay ×2 | often → `surging` |
| Baton charge | +0.20 | → `scattering` (but +grievance) |
| Gas | +0.50 | → `riot` (panic) then `scattering` |
| Loudhailer (low heat only) | −0.30 | → dispersing |
| Withdraw | −0.10/s | → milling (they win today) |

**Player-facing readability:** a temperature ring on the ground (blue→red) plus a bark density
meter. No numbers on screen. HYPOTHESIS: heat must be visible enough to plan, not so visible it
becomes a slider.

**The crowd's "win":** dispersing without arrests is a *low-Standing, high-Legitimacy* outcome.
The Directorate will ask why there were no detentions. That is the entire moral loop of Act II.

---

## 7. Squad AI

> Architecture: **small behaviour trees (12–20 nodes)** for officers, **utility scoring** for
> hostiles. Rationale and per-tick budget in `06-research/02-npc-decision-architectures.md`.
> Deliberately *not* behaviour trees of Isolation's scale (100 nodes): our officers are meant to
> be literal executors, and complexity would fight the fantasy.

- **Literal executors.** They do what's queued; they pathfind, they take cover, they shoot when
  authorised, they *do not* invent plans.
- **Two cheap "thinking" tells** (borrowed from Isolation's alien, which is the only part of it
  we want): when idle, units (a) **double back** ~40% of the distance to a point of interest and
  re-check it, and (b) **stand and look**, rotating through two facing sectors on arrival. Twenty
  lines, and it is what players actually perceive as competence.
- **Traits** (2 per officer, visible in the roster): `Disciplined` (keeps queue under fire),
  `Jumpy` (auto-escalates when startled — dangerous), `Methodical` (+20% speed for Clear),
  `Talker` (can resolve a room with rung 1), `Bruiser` (rung 2 stronger), `Paper-pusher`
  (their report lines are cleaner — reduces audit risk).
- **Named, numbered, mortal.** Losing an officer creates: a report line *you must file* (and
  can lie about), a notice to their family (an actual UI screen), and a squad morale hit.
- **Overwatch's voice** (radio) comments on squad actions constantly. It is *correct* often
  enough to trust and *wrong* often enough to hurt. Its hints come from the Eye's knowledge
  (`SYS-DIR-01` §8), so a hint can be *confidently wrong* — that is the point of the two-brain
  split, imported honestly.

---

## 7b. As built: the result, not the scene

The tactical layer hands the Record exactly one object: `IncidentResult`. It carries
what the scene *observed* — entry method, rooms claimed clear vs actually clear,
loudest noise and how many times the street heard it, damage, walls breached,
subjects never found, stabilised witnesses, unauthorised force. `paperwork.ts`
turns that into a `Truth`, an honest `Claim` draft, and a docket card; the desk
lets the player strike the scene's recorded facts; the audit reads the strikes as
omissions.

That is the integration, and it is deliberately one-way: the tactical layer never
reads the Record, and the Record never guesses what happened in a room.

## 8. Acceptance checks (what "done" means for this system)

1. A player can pause, queue a 3-order plan (stack → ram → clear), unpause, and watch it
   execute without the officers freelancing.
2. With no squad, holding RMB slows to 0.35× and the player can complete a 2-hostile room
   without being hit, at least 50% of the time.
3. Every rung-2+ action produces exactly one report line with the correct tool tag.
4. A door's noise radius is audible-derived in the log (so an audit can prove what a neighbour
   heard).
5. A 34-agent crowd runs at 60 fps alongside 4 officers on the reference machine.
6. **Fairness doctrine holds**: no ambush on the player's first visit to a room; every incident is
   completable at rung ≤2 with at most one recon token. (Authoring checklist, verified per map.)
7. **AI budget**: ≤125 µs/tick for 40 agents; perception is the dominant cost — verify with the
   profiler, not by eye (`06-research/02-...` §6).

---

## 9. Open questions

- Q1: Does Focus trivialise rung-4 combat? (Mitigation: Focus costs stamina *and* does not slow
  enemy reaction, only movement; shootouts stay lethal.)
- Q2: Is 8 orders too many for solo play? (TBD-HYPOTHESIS: solo uses 5; the other 3 grey out.)
- Q3: Do we need a "replay the plan" preview (Door Kickers 2 style)? Deferred to Phase 3.
- Q4: "Clear is a claim" may confuse players. Needs an explicit in-fiction tutorial (the Desk
  says: *"A room isn't clear until the paperwork says it is."*)
