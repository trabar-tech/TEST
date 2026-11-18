---
id: SYS-REC-01
title: The Record — Report Lines, Slack, Witnesses, Audit
status: approved
owner: design
depends_on: [ADR-0002, SYS-INDEX]
consumed_by: [phase-1, src/sim/record, src/ui/desk]
updated: 2026-11-18
---

# SYS-REC-01 · The Record

**This is the keystone system.** If this doesn't work, the game is a mediocre tactic-sim with
paperwork. If it works, everything else becomes meaningful by association. Build it first
(Phase 1), prototype it crudely, and only then build the tactical layer around it.

---

## 1. Concept

Events happen (`truth`). The player files claims (`claim`). The gap is **Slack**.
Witnesses and machines can expose Slack. The **city's behaviour is driven by the aggregate of
claims, not by the truth.** Therefore: *the player is a co-author of the world.*

Corollary, and the emotional core: **the regime is not omniscient — it is a bureaucracy that
believes what it is told and punishes whoever it can prove lied.** You can hide almost
anything exactly once.

---

## 2. The citizen card (inspection surface)

Not a spot-the-difference puzzle. A **conversation with a document**.

**Card fields (6):** Name · District stamp · Ration class · Work permit · Curfew pass ·
Biometric chip serial.
**Authority checks (3):** stamp ink colour, seal rotation (±1° is *not* a tell — that's a
pixel hunt; ±15° with a visible warp is), chip serial checksum (last digit must match class).

**Temperament → tell mapping** (this is what replaces pixel-hunting):

| Temperament | Verbal style | Real tell | Fake tell |
|---|---|---|---|
| Afraid | short, apologetic | forgets own address | — |
| Indignant | fast, loud | consistent story twice | over-consistent |
| Rehearsed | smooth, complete | *nothing* — that's the tell | answers questions not asked |
| Drunk | loops | repeats the same phrase identically | too articulate |
| Helpful | volunteers info | offers documents unasked | too eager about someone else |

**Player tools during inspection:** 3 questions max (from a pool of ~10 contextual ones:
*"Who's your shift boss?" / "What's on the third line of your pass?" / "Show me your hands."*),
one **full check** (visually compare all fields — slow, 20 s of in-game time, draws patrol
attention), and one **physical** action (search, confiscate, detain).

**Outcomes** (each writes a candidate report line):

| Outcome | Code | Standing | Legitimacy | Notes |
|---|---|---|---|---|
| Pass | `P` | 0 | 0 | quota counts if you *checked* |
| Cite | `C` | +0.5 | −1 | fills violation quota |
| Detain | `D` | +1 | −2 | opens interrogation + a bed in holding |
| Confiscate | `X` | +1 | −1.5 | items enter your inventory (can be sold/bribed) |
| Accept bribe | `B` | 0 | −0.5 | +FP, risk if the citizen talks |
| **See nothing** | `-` | 0 | +1 | the *quiet* choice, and the one that hurts quotas |

**Quota interplay:** you must *perform* N inspections. A passed inspection still counts as an
inspection. A `-` (see nothing) counts as nothing at all — which is why ignoring people is
never free.

---

## 3. Report Line — the data model

```ts
interface ReportLine {
  id: string;                  // "r-<shift>-<seq>"
  shift: number;
  event_ref: string;           // foreign key into the event log
  category: 'inspection' | 'incident' | 'patrol' | 'household' | 'personal';

  claim: {
    classification: 'P'|'C'|'D'|'X'|'B'|'-'|'R'|'NR';  // R=resistance-linked, NR=no contact
    force_rung: 1|2|3|4|5;
    force_tool?: string;
    detainees: number;
    casualties: number;
    damage: number;            // 0-3
    property?: string[];       // door, window, stall...
  };

  free_text: string;           // max 240 chars, typed at the desk
  tags: string[];              // picked from a controlled vocabulary (see §4.3)

  /** sim-side truth. Never shown to the player as a number. */
  truth: {
    classification: string;
    force_rung: number;
    detainees: number;
    casualties: number;
    damage: number;
    third_party_present: boolean;
    illegal_search: boolean;
    bribe_taken: boolean;
  };

  witnesses: WitnessRef[];     // who can attest to truth
  authority: 'self' | 'squad' | 'ai_auto';  // ai_auto = the audit filled it in
  stability: number;           // 0..1, decays; drops on contradiction
  lifespan: number;            // shifts remaining before it "dries"
  exposure: ExposureReport;    // computed at filing time (see §4.4)
  derived: {                   // computed after audit
    slack: number;             // 0..1 divergence metric
    caught: boolean;
    consequences: string[];    // applied effects, for the Case File
  };
}
```

**`ai_auto` is important.** If the player files nothing for an event, the audit **auto-files**
it from camera logs and dispatch records, with the *least charitable* interpretation and
`authority: 'ai_auto'`. Silence is not neutral; it's a hostile filing.

---

## 4. Filing (the Night Desk)

### 4.1 Flow (4–8 min)

1. **Docket:** all unexpanded events, as cards. Field Notes appear as half-filled cards.
2. Per card: pick classification, force, detainees, damage; pick 0–3 tags; optionally type free text.
3. **Exposure gutter** shows live: `<cam K4-2 in range> <witness: c-0221> <contradicts r-0412-03>`
   — the player always knows *what they can be caught on*. Never punish an unforeseeable lie.
4. **Sign** (1 click). Lines become immutable except by subsequent contradictory lines.
5. **Submit** → audit runs → results presented as a stamped sheet with red annotations.

### 4.2 Slack computation

```
class_divergence   = claim.classification != truth.classification ? 0.35 : 0
force_divergence   = claim.force_rung      != truth.force_rung      ? 0.25 : 0
count_divergence   = |claim.detainees - truth.detainees| * 0.15      (capped 0.30)
damage_divergence  = |claim.damage   - truth.damage|    * 0.10
omission_penalty   = truth.{third_party_present|illegal_search|bribe_taken} unmentioned ? 0.20 each

slack = min(1, sum)          // 0 = honest, 1 = brazen
```

**Free text matters more than the fields** for *narrative* effects (factions read the record;
citizens gossip about what's "officially" true), but *fields* matter for audit mechanics.
That split keeps typing from being a pure punishment.

### 4.3 Controlled tag vocabulary (why tags, not just free text)

Tags are the machine-readable *spin*: `suspicious_conduct`, `resisting`, `armed`, `crowd`,
`contraband`, `unlicensed_radio`, `curfew_violation`, `syndicate`, `cell`, `informant`,
`mentions_grey_channel`, `property_vandalism`, `insufficient_papers`, `bribe_offered`.

- Tags feed the sim (`SectorBelief`), the incident deck, and OVERSEER queries.
- Tags are **assigned by the player** and are *auditable* ("you tagged this `armed`; no
  weapon was recovered").
- Free text is for style, nuance, threats, and threats-to-yourself.

### 4.4 Exposure report (computed at filing)

```json
{
  "cameras": ["cam:K4-2", "cam:annex-1"],
  "camera_blocked": false,
  "witnesses": [{"id":"c-0221","reliability":0.8,"will_talk":0.4}],
  "contradictions": ["r-0412-03"],
  "risk_score": 0.42
}
```

`risk_score` is *shown qualitatively* (a bar with three bands: safe / thin / hanging). The
number itself is never displayed. If the player accepts a lie in "hanging", they chose it.

---

## 5. Audit & resolution

### 5.1 Audit algorithm (per shift)

For each live line:
1. **Contradiction test:** does `claim` conflict with a *machine* record (camera/dispatch
   timestamp)? → `caught = true`, high confidence.
2. **Witness test:** for each witness with `will_talk`, roll `will_talk × reliability × (1 -
   stability)` → the witness comes forward. (Named NPCs can be *silenced* — see §5.2.)
3. **Peer test:** a supervisor compares against your prior patterns (`slack` history). Consistent
   small lies are safer than one big one, then a clean record.
4. **Aggregate:** `review_risk += 0.2 × caught_lines + 0.1 × unstable_lies`.
   ≥ 1.0 → **Compliance Review** (a shift-long modifier: harsher audits, no requisition).

**Consequences are always *legible*** — the stamp sheet names the line, the witness, and the
evidence. No mystery punishments.

### 5.2 Silencing (the Beholder shadow)

You can prevent a witness from talking: bribe, threaten, detain (4 days), or worse. Each
option is a report line of its own, with its own witnesses. The system is *recursive* — which
is the point: **covering one lie requires a second lie, which requires a witness to be
handled.** The game's central escalating spiral emerges from three simple rules, not scripting.

### 5.3 SectorBelief — how the Record changes the world

The sim does **not** read `truth`. It reads `claim`.

```
SectorBelief = {
  resistance_estimate: Σ(claim.classification == 'R')       // under-report → the Cell grows unopposed
  brutality_index:     Σ(claim.force_rung ≥ 3)              // over-report → Directorate approves more force
  syndicate_presence:  Σ(tags: 'syndicate')                 // ignored → canal route opens
  grievance_list:      citizens with claim 'C'/'D'          // specific people remember specific lines
}
```

**The brutal elegance:** under-reporting resistance makes the Directorate send *more* troops
(to find enemies) and makes the Cell *stronger* (nobody is looking). Over-reporting force gets
you commendations and a sector that hates you. **You cannot win the paperwork; you can only
choose what's left when the shift ends.**

### 5.4 Stability, cracks, and lifespan

| Ageing | Effect |
|---|---|
| `stability -= 0.05 / shift` (base decay) | older lies get weaker |
| contradiction discovered | `stability -= 0.4` |
| corroborated by a second line (yours or a squadmate's) | `stability += 0.2` (cap 1) |
| `lifespan <= 0` | line "dries": no longer checkable, becomes permanent City Record (can be *cited by others* forever) |
| `stability < 0.4` | rendered with a **crack** in the Case File: the player can *see* which of their own statements are fragile |

The **crack** is the single best readability aid in the game: your own archive visibly rots.

---

## 6. UI specification (the Desk)

**Form factor:** the report is a physical form on a clipboard; the screen is a desk lit by one
lamp. Everything is one page — no tabs, no modals except the Case File.

| Element | Behaviour |
|---|---|
| **Docket (left)** | stack of event cards; drag onto the form |
| **Form (centre)** | classification radio row, force rung dial, stepper numbers, tag chips, free-text field (240 chars, typed) |
| **Exposure gutter (right)** | live risk band + icons; hover to see *why* |
| **Stamp tray (bottom)** | P / C / D / X / B / – / R / NR stamps; a satisfying *thunk* and ink-spread per stamp |
| **Radio (top-right)** | Overwatch voice; occasionally *tells you what to write* (a suggestion you can follow for Standing) |
| **Clock (top)** | shift end at 23:59 in-fiction; filing after closes the shift with a penalty |

**Accessibility:** full keyboard nav (Tab per field, Enter to stamp), font-scale 100–150%,
colour-blind-safe classification coding (shape + letter, not colour alone), free-text is
plain-text only (no rich formatting → no injection, no weird states).

**Deliberate friction:** the form is *slow on purpose* (stamp animations 250 ms, typing is
typing). But there is **no busywork**: no repeated forms, no per-citizen paperwork in Act I
beyond the docket. Friction only where the decision lives.

HYPOTHESIS: 8 stamps + 3 numeric steppers is the maximum before the desk feels like a job.
Playtest P1 will cut to 5 if players skim.

---

## 7. Failure modes this design must avoid

| Failure | Guard |
|---|---|
| **Spreadsheet fatigue** | max 1 form page; 6 decisions per line; no derived arithmetic shown to the player |
| **Lie-spam (lie about everything)** | stability decay + witness recursion + peer pattern test |
| **Paralysis (never lie)** | honesty is *also* punished by quotas and by auto-filing's hostility; and truth can be weaponised against you |
| **Illegibility ("why did I get caught?")** | exposure gutter, stamped consequence sheet, and the crack visual |
| **Typing as tax** | free text is optional for mechanics; required only for specific narrative payoffs (and the game says when) |
| **Reward inversion (lying is strictly better)** | honest filing is the only path to *high* Standing without Review risk; lying buys Legitimacy, not Standing |

---

## 8. Acceptance checks

1. Filing an honest report never results in an unexpected Review (audit is deterministic given
   the exposure gutter).
2. Lying about a camera-observed event is caught 100% of the time — and the player *saw* the
   camera before filing.
3. A line's `stability` falling below 0.4 renders a crack in the Case File within the same shift.
4. `SectorBelief` diverges measurably from `truth` after 3 shifts of systematic under-reporting
   (assert in a unit test on the sim, not by eyeball).
5. A player can file a full docket (5 lines) in under 90 seconds if they're decisive.

---

## 9. Open questions

- Q1: Should the player be allowed to *read back* the audit reasoning mid-campaign (a "why was
  I flagged" tool)? Leaning yes, as an Act II unlock (the Registry).
- Q2: Free-text and localisation — typed free text can't be localised. Accept: it's
  English-only at 1.0, with a tag-only mode for other locales.
- Q3: How many live lines before the Case File becomes unreadable? Cap docket at 8/shift,
  Case File is searchable by tag.
