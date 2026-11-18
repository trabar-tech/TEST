---
id: GDD-01
title: Game Design Document — CIVIC ORDER
status: approved
owner: design
depends_on: [PITCH-01, ADR-0002, ADR-0003]
consumed_by: [02-systems/*, 03-production/01-roadmap]
updated: 2026-11-18
---

# CIVIC ORDER — Game Design Document

> Sections marked `HYPOTHESIS:` are unproven and must be prototyped before they get budget.
> Numbers marked `TBD` are placeholders owned by a named task in the roadmap.

---

## 1. Game Overview & Pillars

### 1.1 Core fantasy

> *"I am the man in the mask at the end of the queue. Everyone's day gets worse or better
> depending on what I sign."*

The player is **Warden Ilyas Renner** of Civil Protection, Sector 4, Kiln Row, in the city of
**Vess** — nine years into an indefinite Emergency. The fantasy is not heroism and not
villainy: it is **competence under contradiction**. You are given an impossible daily quota by
people who will never see your face, and you are the last unit of the state that can still
choose to be a person.

The three escalating fantasies:

1. **I know this street.** (Map mastery, routines, informants, shortcuts, the neighbour who
   trades cigarettes for a blind eye.)
2. **I can handle this room.** (Tactical competence: entry, control, escalation, minimal force.)
3. **I decide what is true.** (The Record. The heart of the game — see §3.2.)

### 1.2 Target audience

| Segment | Why they're here | Evidence in design |
|---|---|---|
| **Systems-bureaucracy players** (Papers, Please; Beholder; Not Tonight) | love moral micro-decisions with a form attached | the Record, quota pressure, family upkeep |
| **Tactical-sim players** (Door Kickers; SWAT 4; Doorkickers 2) | want planning, pausing, legible rooms | RTwP, force continuum, breach tools |
| **Dystopia/immersive-sim readers** (HL2, Disco Elysium) | want world texture and a place that outlives them | sector sim, ambient radio, districts |
| **Puzzle/optimisation players** | min-maxing audits and clearance times | scoring, rank, audit risk |

Explicitly **not** targeted: players who want to win by force alone. The game is designed to
make pure coercion *survivable but unsustainable* (§3.3).

### 1.3 Platform & constraints (locked)

- **Single-player only.** No multiplayer, no async ghosts, no leaderboards in v1.
- **PC, browser-first.** WebGL2 + WebAudio. Keyboard + mouse required; gamepad optional,
  never needed. Targeting 60 fps at 1080p on an integrated GPU (Intel Iris Xe class).
- **Always playable in a browser tab.** No installer, no account. Cloud save is a later
  optional convenience, never a requirement.
- Because it is web, the entire design is biased toward **data-driven content** (JSON) and
  **small persistent worlds** (a sector, not a city) — see `04-tech/01-tech-design.md` §2.

### 1.4 Design pillars (with the tension they create)

| # | Pillar | What it forces | The tension it creates |
|---|---|---|---|
| P1 | **The Ledger Is the Weapon** | bureaucracy is the main interface, not the pause menu | the player's best tactical option is often to *write* |
| P2 | **Force Is a Cost** | every violent act has a paper trail, an audit and a budget | you can win a room and lose the shift |
| P3 | **The City Breathes** | the sector has goals of its own and doesn't wait | perfect play is still not total control |
| P4 | **Complicity, Not Villainy** | all factions are people with reasons | the player can never be clean |
| P5 | **Everything Is on the Record** | the world reads the paperwork back to you | lying is powerful *and* fragile |

### 1.5 The core design thesis (the thing that makes this not a skin)

> **In most games, systems simulate the world and text describes it.
> In CIVIC ORDER, the player's written reports are a first-class input to the simulation.**

A lie on a form is not a dialogue option with a karma cost. It is an object with a
**lifespan**: it can be believed, extorted, laundered, contradicted, discovered, or spent. The
insurgency's recruitment numbers literally reference your reports. A family's eviction is a
consequence of a line you typed at 23:40 because you were tired. See `ADR-0002`.

---

## 2. Core Gameplay Loop

### 2.1 The shift (macro loop)

One shift = one in-fiction day, **25–40 minutes** of play, ending in a hard stop: the night
report must be filed before the shift timer ends, or you file an incomplete report.

```
              ┌───────────────────────────────────────────────────────────┐
              │                    ONE SHIFT (25–40 min)                  │
              └───────────────────────────────────────────────────────────┘
  ┌────────────┐   ┌──────────────┐   ┌───────────────┐   ┌────────────────┐
  │ 0. BRIEFING│──▶│ 1. BEAT      │──▶│ 2. RESPONSE   │──▶│ 3. NIGHT DESK  │
  │  (2–3 min) │   │  (8–15 min)  │   │  (2× 4–6 min) │   │   (4–8 min)    │
  └────────────┘   └──────────────┘   └───────────────┘   └───────┬────────┘
        ▲                ▲                    ▲                   │
        │                │                    │                   ▼
        │          ┌─────┴──────┐      ┌──────┴──────┐    ┌──────────────┐
        │          │ Patrol map │      │ Incident    │    │ AUDIT /      │
        │          │ + 3-5      │      │ deck: 2-4   │    │ REVIEW       │
        │          │ micro-     │      │ tactical    │    │ (1 min, auto)│
        │          │ events     │      │ scenes      │    └──────┬───────┘
        │          └────────────┘      └─────────────┘           │
        └───────────────── night consequences applied ◀──────────┘
```

**0 · Briefing (Directorate notice, 2–3 min).** A loudspeaker-formatted text screen: quota,
new directive(s), and yesterday's feedback (commendation, audit flag, or reprimand).
You can requisition gear here and see your family's needs. **No choices are irreversible
here** — this is where you set the shape of your day.

**1 · The Beat (8–15 min).** Top-down patrol of Kiln Row. Walk (no combat stance), inspect
citizens, check doors, talk, and respond to **micro-events** — a queue argument, a
ration-card dispute, a smashed camera, a body in the canal. This is where most of the game's
*moral* content lives and where the tone lands. Key affordance: **you can ignore things.**
Ignoring is logged too (as *nothing*), which is exactly how a real bureaucracy loses events.

**2 · Incident Response (2–4 scenes, 4–6 min each).** A dispatch call drops a tactical scene:
a flat to clear, a checkpoint to hold, a crowd to disperse, a raid on a printery. This is the
*Door Kickers* layer: pause, order, breach, control, escalate. The world state decides what
you walk into:

| Sector tension | What the incident deck gives you |
|---|---|
| low | drunk citizen, unlicensed radio, a hoarder |
| medium | armed lookouts, blocked corridors, a crowd that moves as one |
| high | prepared ambush, RPG on a rooftop, a hostage, an informant in the room |

**3 · Night Desk (4–8 min).** The report. Every incident must be filed. You choose the
**classification** (compliant / non-compliant / resistance-linked / "no contact"), the
**force used**, the **property damage**, the **detainees**, and you may add **free text**.
Free text is typed, and typed text has consequences (§3.2). Then you close the shift, pay
household costs, and the **Audit** runs.

**Audit (automatic, ~60 s of feedback).** The Overseer's algorithm cross-references your
report against camera logs, dispatch timestamps and informant tips. Contradictions cost
**Standing**; excess force costs **Legitimacy** in the sector; under-reporting resistance
saves **Legitimacy** with the street but risks a **Compliance Review** (a mini-game/shift
mutation: you're being watched, so audits are harsher).

### 2.2 The micro loop (moment to moment)

The player is almost always in one of five verbs:

| Verb | Input | Time | Output |
|---|---|---|---|
| **Walk / Watch** | click-to-move + hover | seconds | information, ambient text |
| **Inspect** | hold on a citizen → card compare | 5–20 s | a *truth* they can then record or abuse |
| **Order** | RTwP pause → order widget | 2–10 s | squad actions queued |
| **Control** | crowd/force tools in real-time | 3–30 s | tension changed, damage logged |
| **Record** | night desk, and *field* quick-log | 10 s–5 min | the world's belief about today |

**Field quick-log** is the one addition that keeps the bureaucratic layer from being a
separate game: while on the Beat, you can stamp a **Field Note** (one line, three icons) that
you must later expand at the desk. Field notes are *fragile*: if you don't expand them, the
audit auto-fills them with the least charitable interpretation.

### 2.3 The campaign loop (15 shifts)

Three acts of five shifts each:

| Act | Title | Pressure | New system |
|---|---|---|---|
| I | **Service** (shifts 1–5) | quota is meetable; the street is quiet | inspection, basic incidents, informants |
| II | **Attrition** (shifts 6–10) | quota exceeds what the street can survive; directives contradict | crowds, curfews, audits, family crisis |
| III | **The Ledger** (shifts 11–15) | the sector is a war zone; your own past reports are used against you | mass incidents, purges, your record as a bargaining chip |

Ending: 5 outcomes determined by three axes (Standing with the Directorate, Legitimacy with
Kiln Row, and **what your Record actually says**). Details in §3.7 — deliberately *not* a
good/evil slider, because a maximally "good" record written badly gets you purged for
incompetence.

---

## 3. Mechanics & Systems

### 3.1 Movement, presence, and authority (the Beat)

- **2D top-down, tile-free navigation** on navmeshes. Camera: fixed-zoom isometric-ish top-down
  (slight 15° stylisation, no rotation — readability over cinema).
- **Presence** replaces "aggro". Each civilian has a `dread` value toward the player that
  rises with proximity, uniform visibility, and past behaviour in the sector. High `dread`
  makes people compliant but also *silent* — informants stop talking, and you lose the
  information economy. Low `dread` makes people argumentative and slow. **Neither is
  strictly better**, which is the point.
- **Authority actions** (no weapon drawn): *Address* (call out), *Direct* (point where to go),
  *Detain* (cuffs), *Search*, *Confiscate*, *Cite* (issue a violation). Each produces a
  discrete log entry, feeding the audit.
- **Walking the Beat has a cost.** A visible patrol raises fear and lowers tips; a quiet
  patrol (back alleys, unlit routes) keeps information flowing but fails the "visible
  presence" quota the Directorate sometimes demands. *Directives can demand either.*

### 3.2 The Record — the core system

**Thesis:** the player writes the world.

**Objects.** Every event of the day generates a **Report Line**. A Report Line has:

```json
{
  "id": "r-0412-07",
  "event_ref": "incident:flat_14_breach",
  "claim": { "classification": "R", "force": "hard", "detainees": 2, "damage": 1 },
  "free_text": "Door was already open. Two males, resisting.",
  "truth": { "classification": "R", "force": "hard", "detainees": 2, "damage": 2, "third_party_present": true },
  "witnesses": ["cam:K4-2", "inf:OWL", "cit:c-0221"],
  "stability": 0.7,
  "lifespan": 6
}
```

- **`truth`** is what happened, computed by the sim. The player never sees `truth` as a number;
  they see what they saw.
- **`claim`** is the player's version. Divergence between `claim` and `truth` is **Slack**.
- **`witnesses`** are what make Slack dangerous. Camera logs are machine-truth and *cannot* be
  lied to — but cameras can be **disabled** during the Beat (an action with its own cost and
  its own report line, "camera out — vandalism").
- **`stability`** decays over time and drops when contradicted. Stable lies persist; unstable
  ones become **cracks** — visible to the player as a red underline in later documents.
- **`lifespan`** = how many shifts the line stays *live* (i.e. can still be checked, cited,
  or used against you). After that it "dries" into the permanent City Record.

**Uses of Slack (why lying is fun, not just risky):**

| Use | Effect |
|---|---|
| **Protect** | misclassify a family's violation → they stay housed; you risk audit |
| **Extort** | a stable lie about a citizen is leverage; they become your informant |
| **Launder** | report a brutal incident as "compliance" to keep Legitimacy, at the cost of Standing if caught |
| **Frame** | attribute force to another unit (a real system: NPC wardens exist and have their own reports) |
| **Contradict** | deliberately contradict a *superior's* record to damage them — Act III politics |

**The Paper Truth rule (ADR-0002).** When two records conflict, the sim resolves by
precedence: `machine > stable human > unstable human > silence`. Silence is the weakest claim,
which is why "the Directorate only knows what you tell it" is true *and* why the empty line is
the most damning thing on a form.

**Anti-frustration:** the player is always shown **what they can be caught on** before filing
(the "exposure" gutter: cameras in range, witnesses logged, prior contradictory lines). The
game never punishes a lie the player had no way to see coming. It *does* punish greed.

### 3.3 Force, escalation, and the continuum

Combat is not a health bar contest. It is a **legibility contest**: you want to end a scene
with minimum *recorded* force and maximum *real* control.

**The Force Continuum (5 rungs, each with an audit weight and a Legitimacy cost):**

| Rung | Tools | Audit weight | Legitimacy cost | Notes |
|---|---|---|---|---|
| 1 Presence | uniform, voice, posture | 0 | 0 | most crowds disperse here |
| 2 Control | baton grapples, shoves, pain compliance | 1 | ~1 | non-lethal, loud |
| 3 Compliance | stun baton charge, gas, door ram | 3 | 3 | area effects, collaterals |
| 4 Lethal | sidearm, pulse rifle (squad) | 8 | 12 | each death is a report line + inquiry |
| 5 Collective | squad volley, drone sweep | 15 | 30 | a *shift-level* event; the Directorate notices |

**Rules:**
- **Escalation is sticky.** Once you use rung 3 in a sector, crowds start at rung 2 next day.
  The continuum *ratchets*, sector-wide — this is the "HL2-Alyx vs HL2" contrast the brief asked
  for, made mechanical: **suppression and rebellion are both ratchets, and they feed each other.**
- **De-escalation is possible but expensive** (public amnesty directive, a ration increase,
  giving up an informant). It takes 2–4 shifts to walk a ratchet back down.
- **Lethal is always available and always wrong-ish.** It solves the room and worsens the
  sector. HYPOTHESIS: 60% of players will use it in the first hour; the design intent is that
  they learn the cost by shift 3 without being scolded.

**Combat model (RTwP):**

- **Real-time by default**, at 1.0×. **Space = pause**, orders can be issued while paused
  (classic RTwP). Orders queue with 2-second "plan" animations at 0.15× time.
- **Solo slow-mo.** If the player has **no squad attached** (very common in Act I), holding
  right-mouse engages **Focus**, a 0.35× timescale with a 6-second stamina budget, recharging
  in 9 s. This is not bullet-time spectacle — it is *reading a room*. The "quick chat" ordering
  the brief asked for is handled as **Squad Comms**: a radial with 8 voice-line orders,
  hotkey-triggered, no pause; issuing 3+ orders in 5 s while unpaused grants a **Flow**
  bonus to squad discipline.
- **Squad size:** 0–4 attached CP officers, plus one specialist (breacher / medic / tech).
  Squad AI is *deliberately literal*: they execute the queued plan and do not improvise well —
  improvisation is the player's job. Squad members have names, service numbers, and their own
  report lines. **They can be lost, and losing one is a report line you must file.**

**Breach-and-clear (Door Kickers layer):**

- Doors have states: `locked / barred / ajar / open / wedged / trapped`. Tools: ram, kick,
  shotgun (lethal breach: loud, damages door, audible 2 rooms), crowbar, keycard, "knock and
  talk" (the cheapest and slowest).
- **Info economy:** you never see the whole room. You see what your *unit* can see — keys,
  sound pings, a camera feed, an informant's floor plan. **Recon is a spendable resource**
  (drone 1 charge, informant 1 use/day, camera feed).
- **Entry types:** stack & enter, split, flank, roof, window, "gas and wait" (slow, high
  Legitimacy cost, near-zero officer risk), "shout them out" (risky, cheap, often works).

**Crowds.** Not a physics blob. A crowd is a **mood graph**: 12–40 agents on a
social graph with a shared `heat` scalar. Player tools: kettle (contain), line (push), loudhailer
(direct, works only on low heat), arrest (grabbing a leader *raises* heat by 2, then decays
faster). Readable via an overlaying "temperature" ring.

### 3.4 Inspection, interrogation, and the citizen card

**The citizen card** is the Papers-Please surface, but it must not be a pixel-hunt.

- Cards have **6 fields** (Name / District stamp / Ration class / Work permit / Curfew pass /
  Biometric chip) and **2–3 authority checks** (stamp color, seal orientation, chip serial).
- **Inspection is a conversation, not a spot-the-difference.** Each citizen has a temperament
  (afraid, indignant, rehearsed, drunk, helpful), and the discrepancy they present is attached
  to a *social* tell: a rehearsed story is smooth, a real one is messy. The player's tools are
  **questions** (3 max per citizen), not just a magnifying glass.
- **Outcomes:** *pass / cite / detain / confiscate / accept a bribe / "see nothing"*. Each maps
  directly to a report-line classification.
- **Interrogation** (detained citizens, up to 4 per day): a short, 3-beat structure —
  **pressure, offer, threat**. Each beat has a cost (time, Legitimacy, force rung). Yields
  **intel tokens** (a name, a location, a courier route) that become actionable incident cards.
  HYPOTHESIS: 3 beats × 3 options is enough depth without becoming a visual novel.
- **The information economy** ties this to §3.3: intel you don't act on expires; intel you act
  on badly burns the source.

### 3.5 Directives (the shifting rules)

Directives are the game's *difficulty and drama dial*, delivered like a municipal notice.

- A **Standing Directive** is permanent (e.g. "All citizens must carry a curfew pass").
- A **Daily Directive** lasts one shift and often *contradicts* the standing one: "Today:
  curfew pass checks are suspended — visible patrols only." Obeying the wrong one is a real
  cost, and the contradiction is the drama.
- **Directive structure (data):**

```json
{
  "id": "dir-0197",
  "type": "daily",
  "text": "Effective 06:00: all non-residents in Kiln Row are to be detained pending screening.",
  "quota": { "inspections": 40, "detentions": 8, "visible_patrol_minutes": 30 },
  "contradicts": ["dir-0180"],
  "audit_weight": 2,
  "reward": { "standing": 2, "requisition": 1 },
  "penalty": { "standing": -2, "review": 1 }
}
```

- **Quota math is the economy.** Quotas rise geometrically; the sector's capacity falls as
  tension rises. The player is asked to hit numbers that require them to *invent* violations.
  This is the single most important pressure in the game — build it first, tune it last.

### 3.6 Morality, loyalty, and the three-track reputation model

No single karma bar. Three tracks, which never align cleanly:

| Track | Range | Visible as | Raised by | Lowered by | Consequences |
|---|---|---|---|---|---|
| **Standing** (Directorate) | -50…+50 | your badge filigree, your rank | quotas, accurate reports, denunciations | failed quotas, audit contradictions | pay, gear access, squad size, survival |
| **Legitimacy** (Kiln Row) | 0…100 | street temperature, NPC barks, graffiti | restraint, protecting families, de-escalation | force, raids, curfews, denunciations | intel flow, sabotage, ambush rate, ending |
| **Integrity** (private) | 0…100, hidden until Act II | your family's reactions, your journal | keeping your word, admitting fault | complicity you can't rationalise | ending branch, family events, your own testimony |

**The tension is structural, not scripted:** quotas *require* Legitimacy damage, so Standing and
Legitimacy are in direct conflict by design. Integrity is the seatbelt: it doesn't reward you,
it just changes what you're able to say at the end.

**Family layer (Beholder-style, but not a monster-in-the-wall):** a spouse and a child in a
one-room flat, who need ration points, medicine and papers. They are a *sink* for Standing
income and a *source* of pressure ("we need the good stamps this month"). Family scenes are
short, domestic, and are where the game says the quiet part: you are doing this for *them*,
and they are starting to know what you do.

### 3.7 Fail states and endings

- **Fail forward.** Being purged or losing your family is an *ending*, not a game over. The
  campaign is designed to be finishable in a worse state.
- **Hard fail** only on: death (rare, usually from your own escalation), or 3 consecutive
  Compliance Reviews.
- **5 endings**, keyed on (Standing, Legitimacy, Integrity, and the Record's dominant
  classification):
  1. **Promotion** — you're the problem now (leads into the OVERSEER expansion).
  2. **Quiet Exit** — you retire on a lie you can live with.
  3. **The Witness** — you hand your own record to the insurgency.
  4. **Purged** — your reports found you first.
  5. **The Empty Flat** — you did everything right and it took your family anyway.

---

## 4. World & AI Simulation

### 4.1 The sector as a machine

Kiln Row is a **node graph of ~14 blocks** (tenement row, canal market, laundry, tram depot,
checkpoint gates, printery, radio tower basement, the Directorate annex). It is small on purpose:
a web build must keep the whole sector resident.

**Layers of simulation:**

| Layer | Runs | Granularity | Player visibility |
|---|---|---|---|
| **Population** | per shift (fast) | ~400 abstracted citizens in 60 households | via informants, notices, prompts |
| **Agents** | real-time while visible | 12–40 individualised agents | fully visible |
| **Households** | per shift | 60 records (housing, ration, loyalty, secrets) | via the Registry, a desk tool |
| **Factions** | per shift | 4 organised groups with goals | via intel, incidents |
| **Sector state** | continuous | temperature, surveillance coverage, supply | always visible in the HUD |

### 4.2 Directors (plural, layered)

The brief asked about an Alien-Isolation-style director. One director is wrong here — it would
make the world feel like it's *hunting the player*, which fights the "you are one input among
many" fantasy. Instead: **three directors with different jobs, arbitrated by a low-priority
third.**

| Director | Goal | Inputs | Outputs | Cadence |
|---|---|---|---|---|
| **The Pressure Director** ("the Desk") | keep the shift *interesting and thematically coherent* — choose incidents and directives that test the player's current moral fault line | player's record history, Integrity track, unused incidents | incident deck, daily directives, quota nudges | between shifts |
| **The Insurgency** ("the Cell") | pursue its own goals: recruit, arm, hide, strike | Legitimacy, informant network, crackdowns, supply | sabotage events, ambush setups, safehouse moves, propaganda that quotes *your reports* | per shift, with a 3-shift plan |
| **The Overwatch** ("the Eye") | maintain surveillance and dispatch; escalate monitoring when it can't see | camera coverage, detection events, audits | drone overflights, checkpoint demands, forced audits | continuous |

**The Arbiter.** A tiny rule engine resolves conflicts and enforces **pacing budgets**: no more
than 2 armed incidents per shift, at least 1 quiet scene, no repeat of the same incident archetype
twice in 3 shifts. The Arbiter has no personality — it's the editor, not the antagonist.

**Why this is better than one "AI director":** each director has a *different model of the
player*, so their disagreements produce texture: the Cell thinks you're a brutaliser, the Eye
thinks you're sloppy, and the Desk gives you a directive that requires you to be both
inconsistent. That is the game.

### 4.3 Civilian routine model

Every visible agent has a **day plan** generated from a template per archetype:

```
template: worker
 06:20 queue_ration (market)        ← micro-event seed: card dispute
 07:10 tram_to_factory (tram_stop)
 12:00 lunch (alley)                ← micro-event seed: contraband trade
 17:40 curfew_run_home (route A/B)  ← choice: risky shortcut or safe long way
 20:00 home (flat_14)               ← household state updates
```

- Routes are *chosen* (weighted by dread, curfew, patrol presence), not scripted. A citizen
  who sees a checkpoint on route A takes B and is late — which is itself a violation.
- **The interesting cases are the ones that break pattern.** The sim flags deviations and
  turns them into Beat micro-events. This is how a small sim produces a feeling of a whole city:
  the player learns routes and then *notices* when one is wrong.

### 4.4 Factions and the antagonism ladder

| Faction | Goal | Turns hostile when | Offers |
|---|---|---|---|
| **The Cell** (insurgents) | arm, recruit, strike a checkpoint | crackdowns > threshold; informant burned | raids, hostage scenes, a chance to defect |
| **The Syndicate** (smugglers) | keep the canal route open | confiscations, arrests of couriers | bribes, black-market gear, deniable intel |
| **The Congregation** (a banned chapel) | hold services, hide the sick | curfew enforcement on their street | community goodwill, hiding your family in a crisis |
| **Civil Protection** (your own) | quotas, careers | your report contradicts a superior's | requisitions, backup, cover-ups |

**Antagonism is a ladder, not a flag:** `calm → wary → hostile → active → desperate`. Each
rung has distinct incident content. Escalating a faction is easy; de-escalating requires
*specific* acts (returning confiscated goods, letting a courier go, filing a false report).

### 4.5 Escalation model (the "HL2 vs HL2:Alyx" contrast)

Sector **temperature** (0–100) is a function of Legitimacy (inverse), force usage, curfew
enforcement, supply shortages, and faction antagonism:

```
temp = 0.5*(100 - Legitimacy) + 0.2*force_index + 0.15*supply_deficit + 0.15*faction_heat
```

Temperature drives:
- **Incident difficulty** (deck weights)
- **Ambient content** (barks, graffiti, radio, empty streets vs crowds)
- **Suppression options unlocked** (at >70 you get curfews, sweeps, drone patrols — and each
  of those adds +heat, so the game becomes a spiral *unless* the player spends Standing to
  de-escalate)
- **Visual grade** (the city gets darker, emptier, quieter — cheap, high-impact art direction)

This is where the brief's key insight lives: **the player never chooses "oppression level"
directly; they choose actions, and the ratchet does the rest.**

### 4.6 Dynamic events & ambient storytelling

Three kinds of authored-feeling content, all data-driven:

1. **Micro-events** (Beat): 60+ short encounters, 30–90 s each, weighted by temperature and
   time-of-day. Each has 2–4 resolutions mapping to report classifications.
2. **Ambient stories** (no input): a queue that murmurs a rumour that references a real
   incident from 2 shifts ago; a poster with a face you detained; a neighbour who stops
   greeting you. Generated from the sim state, not scripted set-dressing.
3. **Crisis events** (rare): the canal body, the checkpoint bombing, the informant's
   disappearance. Each triggers a *multi-shift* thread.

---

## 5. Progression & Economy

### 5.1 Currencies

| Currency | Source | Sink | Notes |
|---|---|---|---|
| **Standing** | quotas, clean audits, denunciations | rank, gear, family privileges, cover-ups | can go negative = probation |
| **Requisition Points (RP)** | per shift, scaled by rank & quota | gear, squad specialists, drone charges | resets partially each shift (use it or lose it) |
| **Ration Points (FP)** | wage | family upkeep, bribes, medicine | the *real* economy; short supply is the drama |
| **Intel Tokens** | interrogations, informants | incident cards, recon, leverage | expire in 2–3 shifts |
| **Slack** (implicit) | lies | protection, extortion, laundering | not a number you see; it's a resource you *feel* |

### 5.2 Officer progression

No XP. **Rank is granted, not earned**, and it is granted by Standing + audit cleanliness +
Directorate politics. Each rank changes the *shape* of the job, not just numbers:

| Rank | Shift | Authority | Squad | New verb |
|---|---|---|---|---|
| Warden 3rd | 1 | inspect, cite, detain 1 | 0 | — |
| Warden 2nd | 3 | + search w/o cause, curfew enforcement | 0 | **Field Note** |
| Warden 1st | 6 | + home entry on suspicion | 1 | **Squad Comms** |
| Inspector | 9 | + raids, collective force authorisation | 2 | **Interrogation** (advanced) |
| Section Lead | 12 | + drone tasking, audit override (1/shift) | 4 | **Denounce** |

**Perks** are *directorate-recognised competencies* (each has an audit consequence, so power
costs visibility): e.g. *"Paperwork Discipline"* (auto-fills 1 field correctly), *"Street Ear"*
(+1 informant), *"Heavy Hand"* (rung-3 tools cheaper, +1 Legitimacy cost), *"Bent Stamp"*
(forged passes — powerful, catastrophically risky if audited).

### 5.3 Gear & requisition

Tools are **capability purchases**, priced in RP and in **audit weight**:

| Tool | RP | Audit | Effect |
|---|---|---|---|
| Stun baton | 2 | 1 | rung 2/3 in melee, non-lethal |
| Door ram | 2 | 1 | breach `barred` instantly, loud |
| Gas canister | 4 | 3 | room clear, Legitimacy hit, collaterals |
| Drone (1 charge) | 5 | 0 | recon a room before entry |
| Riot line kit | 5 | 2 | crowd containment |
| Suppressor (sidearm) | 6 | +2 if used | silent lethal — *removes a witness, adds a mystery* |
| Camera access (shift) | 3 | 0 | see 2 fixed cameras on the tactical map |

**Key rule:** the most *effective* gear is the most *incriminating*. There is no pure upgrade
path — only trade-offs.

### 5.4 Household economy

Each night: rent (FP), food (FP), medicine (conditional), and one rotating "need" (a school
permit, a stove part, a debt). Income = wage(rank) - deductions(penalties, fines, bribes you
took that got noticed). If you can't pay, you choose: **borrow from the Syndicate** (opens a
debt thread that will be called in as an incident), **sell gear** (lose capability), **take a
bribe** (Integrity), or **let the rent slip** (family consequences, escalating).

HYPOTHESIS: the household economy should be *tight but never a spreadsheet tax* — 3 line items
per night, no more. If playtests show players skimming it, cut to 2.

### 5.5 Meta-progression beyond the campaign

- **Continuing Service** (endless): procedural shifts at your rank, with directives and a
  persistent sector. Designed for players who want to live in the job.
- **Case File** (per-save): a browsable archive of every report line you've ever filed,
  cross-linked. It is the game's *memory*, and in the expansion it becomes the *level select*.

---

## 6. Future Expansion — *OVERSEER*

> Full spec: `02-systems/05-overwatch-expansion.md`. Summary here because it changes the
> base game's architecture requirements (§6.4).

### 6.1 The pitch

You are promoted into the machine. You are no longer a body on Kiln Row — you are **the
attention of the city**: a distributed system of cameras, dispatch queues, drone bays, and
the indifferent voice that tells wardens where to die.

The fantasy flips from *"can I control this room"* to *"can I control this city with 4 squads,
2 drone bays, 11 minutes of latency, and a public that must not find out."*

### 6.2 Design answer to the brief's objection (the moral-dilemma problem)

The brief correctly spotted the trap: *if Overwatch is always watching, the operators have no
private space, so where's the moral tension?*

**Answer: the moral tension moves from *choice* to *interpretation and allocation*.**

1. **Overwatch sees everything and understands almost nothing.** Its feeds are noisy,
   delayed, and tagged by *humans* — the wardens and the analysts. The Overseer's job is not
   deciding who's guilty; it's deciding **whose report to believe**, and it *knows* the reports
   are biased because it wrote the incentives that made them biased.
2. **The turn is epistemic.** In the base game you lied to the system. In OVERSEER, you *are*
   the system, and you inherit a city built out of lies — including **your own imported
   reports**. The questions become: do you correct a record that protects a family? Do you send
   a squad to verify something you already know is false? Do you purge a warden for lying, when
   lying is what kept the sector calm?
3. **Scarcity is the moral engine.** You cannot watch everything. Every camera you task is a
   camera not watching elsewhere; every audit is a squad not dispatched. **Neglect, not cruelty,
   is the sin** — and neglect is invisible until it isn't.
4. **Accountability arrives anyway.** Act III of OVERSEER is a *Directorate inquiry* into your
   own decisions, using your own dispatch logs. The Eye can be audited. That's the dread.

So: no, there's no privacy dilemma — and that's the point. **The regime's sin isn't surveillance;
it's that surveillance can't see meaning, so it substitutes paperwork for understanding.**
OVERSEER is the game about being the paperwork.

### 6.3 What carries over

| Carried | How |
|---|---|
| Your Record | imported; becomes the *ground truth layer* that conflicts with new feeds |
| Sector state | Kiln Row's temperature, factions and grudges persist |
| Named NPCs | wardens you served with are now units you command (and can sacrifice) |
| Knowledge | the player's map/route knowledge is now *dispatch optimisation* material |

### 6.4 Why the base game must be built for it from day one

Three architectural commitments (detail in `04-tech/01-tech-design.md`):

1. **The Record is a data layer, not UI.** Reports are serialisable objects with stable IDs,
   queryable by the sim. Otherwise OVERSEER can't read them.
2. **All tactical content is declarative** (maps, doors, incidents as JSON). OVERSEER reuses
   the tactical layer as a *simulation* you dispatch into, not a mode you play.
3. **Time is a first-class clock** (deterministic tick-based sim, seeded). OVERSEER runs the
   same clock at a macro scale; save-format must survive it.

### 6.5 OVERSEER's macro loop (one "watch cycle" = 20–30 min)

```
 ANALYSE (read feeds, flag anomalies) → ALLOCATE (squads, drones, audits, curfews)
   → DISPATCH (send; watch the tactical scene play out in low-fi or take manual control)
   → ASSESS (what did the wardens report? what do the cameras say?)
   → REPORT UP (your own record, which can be audited later)
```

**The sting:** you can take manual control of any dispatched squad — dropping back into the
base game's tactical layer. Doing it too often is flagged as *micromanagement* (Standing loss)
because the Directorate wants you delegating. So the base game's most fun verb is a **scarce,
audited privilege** in the expansion.

---

## 7. Art, Audio, and Narrative Direction (brief)

- **Visual:** 2D top-down, drawn at 96 px/m, muted cobalt-and-rust palette, heavy ambient
  occlusion via baked light maps. Cities read as *wet grey + one institutional accent colour*
  (the Directorate's teal). Characters: 4-direction, 8-frame, high-contrast silhouettes because
  readability beats fidelity at this camera distance.
- **UI:** diegetic-forward. The report is a physical form. The HUD is a clipboard, a radio
  handset, and a badge. **No RPG number soup** — Standing is a filigree, Legitimacy is the
  street's sound, Integrity is a journal.
- **Audio:** bureaucratic ambience (loudspeakers, tram brake, printer, distant drone), sparse
  music (dying industrial drone) that *ducks entirely* during inspections so the player hears
  the citizen breathe.
- **Narrative:** told through documents, radio, and witnesses — never a cutscene longer than
  40 seconds. The player is the camera; the regime is the narrator.

---

## 8. Scope, cut lines, and unknown-unknowns

**MVP scope statement (for the playable prototype):** 1 sector (4 blocks), 1 shift, 6 citizens,
3 micro-events, 1 incident (a flat breach with 3 possible layouts), the Record with 5 fields,
a quota, and an audit. That is *enough* to know if the game works.

**Deliberately deferred:** crowds (>20), squads (>1 officer), family layer, inter-faction
politics, Overwatch expansion, art beyond placeholder.

**Biggest unknowns (ranked):**
1. Does the Record actually *feel* like the core? (Prototype P1 — go/no-go)
2. Is Papers-Please inspection repetitive by shift 5? (mitigation: questions + social tells)
3. Can a web build hold the tactical + sim layers at 60 fps? (tech risk, `02-risk-register.md`)
4. Is RTwP + solo slow-mo two games stapled together? (mitigation: Focus and pause share
   one timescale engine and one order vocabulary)

---

## Appendix A — Reference matrix (what we borrow, and what we refuse)

| Reference | We take | We refuse |
|---|---|---|
| *Papers, Please* | the form as interface, moral pressure via quota | pixel-hunting, one-note grimness |
| *Beholder* | domestic pressure, informant mechanics | cartoon villainy, spy-cam voyeurism |
| *Door Kickers* | RTwP, plan-then-execute, breach tools | omniscient recon (we gate information) |
| *SWAT 4 / Ready or Not* | force continuum, escalation cost | pure tacticool fantasy |
| *Half-Life 2* | ground-level oppression texture, loudspeaker world | its story, iconography, enemy design, IP |
| *Disco Elysium* | text-as-mechanic, a place that argues back | its tone of self-aware melancholy |
| *Alien: Isolation* (director) | dynamic pressure | a single director hunting the player |
| *This War of Mine* | cost-of-survival framing | civilian-only POV |
