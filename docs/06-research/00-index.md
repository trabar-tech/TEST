---
id: RES-INDEX
title: Research Index — what we read, what we adopted, what we rejected
status: approved
owner: design
depends_on: [GDD-01, SYS-INDEX]
consumed_by: [SYS-DIR-01, SYS-SIM-01, PROD-ROADMAP]
updated: 2026-11-18
---

# Research Index

Read this before designing any new AI, simulation, or content-selection system. It exists so the
project doesn't re-derive known solutions — or copy known failures.

**Files**

| File | Covers |
|---|---|
| `01-director-ai-anatomy.md` | *Alien: Isolation*, *Left 4 Dead*, *RimWorld*, *Shadows of Doubt*, storylets/QBN, the Nemesis system (and its patent) |
| `02-npc-decision-architectures.md` | utility AI / behaviour trees / HTN / GOAP — and which one each layer of **our** game uses |

---

## 1. The short version (if you read nothing else)

1. **Alien: Isolation's famous "Director" is much smaller than its reputation.** It is a utility
   job-system that watches a *menace gauge* and periodically hands a hint to a separate
   behaviour tree. The horror comes from the **two-brain split** (one brain knows, the other
   must find) — not from sophisticated planning. **Steal the split, not the stalking.**
2. **Its genre fit is the problem, not its structure.** Confirmed: the design is
   player-centric chase horror. Every output is "make the monster be near the player". That is
   *exactly* wrong for us, because our world must feel indifferent and multi-agent. But two
   sub-mechanisms transfer cleanly: the **menace/attention gauge** and **protected zones for
   fairness**.
3. **Left 4 Dead's Director is four lines of logic and one finite state machine.** Intensity
   estimate → track max → too high, remove threats → otherwise populate. Valve's own summary:
   *"the simplest worked really effectively."* This validates the three-director plan **if** each
   director is dumb and inspectable.
4. **RimWorld's storytellers are not intelligent.** They are scheduled dice with different
   parameters and personalities. The *depth* comes from the simulation underneath and from
   **apophenia** — the player's pattern-hungry mind. Two consequences for us: keep the cast
   small enough to remember, and never hide the storyteller's *purpose* (only its maths).
5. **Shadows of Doubt proves 250–300 simulated citizens with routines is achievable — and that
   repetition is the failure mode.** Its criticism is consistent: "repetitive", "lacks
   connective tissue". We must spend our content budget on **connective tissue** (the Record,
   grudges, callbacks), not on population size.
6. **Storylets / quality-based narrative is the right content architecture** for micro-events
   and directives: content + prerequisites + effects, drawn from weighted decks. It is how
   *Fallen London* gets thousands of small authored moments to interlock, and it is far cheaper
   than a branching tree.
7. **Do not build a Nemesis system.** Warner Bros. holds a patent (running to ~2035) on
   procedurally generated characters that remember player encounters and are promoted through a
   hierarchy. Our "named grudge" feature is adjacent enough that it needs an explicit,
   documented design boundary (see `01-director-ai-anatomy.md` §6).

---

## 2. Adopted / rejected ledger

Every borrowed idea gets a verdict. "Adopted" means it appears in a spec; "rejected" means it is
recorded so nobody re-proposes it in three months.

| # | Idea | Source | Verdict | Where it landed |
|---|---|---|---|---|
| 1 | Two-brain split: an omniscient *coordinator* that only **hints**, and a situated *actor* that must actually find things | Alien: Isolation | **Adopted (analogy)** | SYS-DIR-01: the Eye knows everything, the wardens/citizens know only what they perceive. The Eye's hints are *radio calls* that can be wrong. |
| 2 | Menace gauge (proximity/visibility/audibility → tension) | Alien: Isolation | **Adopted, re-purposed** | Becomes **Oversight Attention** (§4.3 below) — how closely the Eye is watching *you*. Not fear: scrutiny. |
| 3 | Protected zones / "the AI never looks here" for fairness | Alien: Isolation | **Adopted** | The Beat's safe corners and the "no ambush on a first visit" rule. Fairness is a legal move in systemic games. |
| 4 | Behaviour-node **unlocking** to fake learning | Alien: Isolation | **Adopted** | Faction behaviour sets unlock by act and antagonism rung. Cheap, reads as adaptation. |
| 5 | Sub-optimal search paths / backtracking to read as "thinking" | Alien: Isolation | **Adopted** | Patrol and search behaviour: deliberate double-backs, "checking" beats. |
| 6 | Intensity estimate → 4-state pacing FSM (calm/build/peak/release) | Left 4 Dead | **Adopted** | The **Arbiter** uses exactly this, per shift. |
| 7 | "Structured unpredictability" — layered simple algorithms, designer-tunable | Left 4 Dead | **Adopted as a law** | Rule: no director may be a black box. Every director output must be traceable in `debug:bus`. |
| 8 | Active-area-set / flow-distance population | Left 4 Dead | **Rejected** | We have one small sector; there's no streaming population problem. |
| 9 | Three storyteller personalities | RimWorld | **Adopted, inverted** | We don't give the player three storytellers. **The three directors *are* the personalities**, and the player doesn't get to pick — the regime does. That's the joke. |
| 10 | Apophenia: players read story into small systems | RimWorld | **Adopted as a budget rule** | Cap "Known" named citizens at **12**; everything else is a record, not a face. |
| 11 | Small, fully-simulated city with per-citizen routines | Shadows of Doubt | **Adopted at 1/5 scale** | 60 households, ~40 live agents, 4 blocks. We buy *depth per person*, not population. |
| 12 | Failsafes so generated situations stay solvable | Shadows of Doubt | **Adopted as a hard rule** | Every incident must be completable with rung 1–2 force and one recon token. Assert in authoring checklist. |
| 13 | Crime-board / connective UI | Shadows of Doubt | **Adopted** | The Case File, plus an Act II "Threads" board linking report lines. |
| 14 | Storylets with prereqs + effects, drawn from decks | Fallen London / Emily Short | **Adopted as the content format** | Micro-events, directives, family scenes, radio. See `01-director-ai-anatomy.md` §5. |
| 15 | Opportunity decks / narrative deck-building | Fallen London | **Adopted (limited)** | Requisition and "favours owed" as deck modifiers — Act II onwards. |
| 16 | Epilogue storylets (delayed callbacks) | Fallen London | **Adopted** | How grudges and silenced witnesses resurface 3–6 shifts later. |
| 17 | Nemesis-style remembered rivals with promotion | Shadow of Mordor | **Rejected (legal)** | See §6 of the anatomy doc. We keep *records* that remember; we do not promote an enemy hierarchy. |
| 18 | Full GOAP planners for NPCs | F.E.A.R. lineage | **Rejected** | Wrong cost/benefit for a web build; see `02-npc-decision-architectures.md` §3. |
| 19 | 100-node behaviour trees | Alien: Isolation | **Rejected** | Our officers are meant to be *literal executors*; complexity would fight the design. 12–20 nodes max. |
| 20 | Async/online nemesis-style social features | Shadow of Mordor | **Rejected** | Strictly single-player. |

---

## 3. What this research changed in the GDD

Research is only worth doing if it changes decisions. It changed six:

| Change | Before | After | Doc |
|---|---|---|---|
| R-1 | 60 households, all "citizens you can know" | **12 Known faces** (named, portraited, remembered) + 48 records. Apophenia budget. | SYS-SIM-01 §2.1 |
| R-2 | "The Eye is always watching" | **Oversight Attention** gauge: scrutiny is a *variable* that rises and falls and is spendable/abusable | SYS-SIM-01 §4.3 |
| R-3 | Directors unspecified internally | Directors = **utility-scored storylet decks** + a 4-state pacing FSM in the Arbiter | ADR-0004, SYS-DIR-01 §6 |
| R-4 | Behaviour trees implied | Officers get **small BTs (12–20 nodes)**, citizens get **utility schedules**, the Cell gets **HTN-lite plans** | 02-npc-decision-architectures.md |
| R-5 | No fairness doctrine | **Fairness doctrine**: protected zones, no first-visit ambush, every incident solvable at rung ≤2, no lie punished without visible exposure | SYS-DIR-01 §7 |
| R-6 | Grudge system informal | Grudges are **document-linked records**, explicitly *not* a promoted rival hierarchy (patent boundary) | SYS-SIM-01 §2.2 + risk R16 |

---

## 4. Sources

Read in full or in substantial part during this research pass (2026-11-18):

1. Thompson, T. — *The Perfect Organism: The AI of Alien: Isolation* (AI and Games). Two-brain
   split, menace gauge, utility job system, 100-node BT with ~30 top-level nodes, node unlocking,
   search vs. spot locations, protected zones.
   <https://becominghuman.ai/the-perfect-organism-d350c05d8960>
2. Švelch, J. — *Should the Monster Play Fair? Reception of AI in Alien: Isolation*, Game Studies
   20(2), 2020. Player reception of "unfair" director hints; "psychopathic serendipity".
   <https://gamestudies.org/2002/articles/jaroslav_svelch>
3. Booth, M. — *The AI Systems of Left 4 Dead*, GDC 2009 (summarised). Intensity estimate, four
   states, structured unpredictability, "the simplest worked really effectively".
   <https://www.cs.drexel.edu/~so367/teaching/2012/CS680/papers/11%20Secrets%20about%20LEFT%204%20DEAD%e2%80%99s%20AI%20Director%20and%20its%20Procedural%20Zombie%20Population%20%7c%20AiGameDev.com.pdf>
4. L4D Director overview — flow distance, active area set, layered simple algorithms.
   <https://centerconsulting.com/ai-library/concepts/l4d-director>
5. RimWorld — AI storytellers (Cassandra / Phoebe / Randy), apophenia interview with Tynan
   Sylvester, "if something's really hard to do, just don't do it".
   <https://www.rockpapershotgun.com/how-rimworld-generates-great-stories> ·
   <https://rimworldwiki.com/wiki/About_RimWorld>
6. *Algorithmic Authors: RimWorld's AI Storytellers as Agents of Literary Genre* — storytellers as
   procedural authors, not difficulty sliders.
   <https://medium.com/@coyega1328/algorithmic-authors-rimworlds-ai-storytellers-as-agents-of-literary-genre-eff70ea4560c>
7. Cole Jeffries interview — *Making a true detective game in Shadows of Doubt*, GamesIndustry.biz.
   Simulated citizens, solvability failsafes, city size limits, "the AI as subject".
   <https://www.gamesindustry.biz/making-a-true-detective-game-in-shadows-of-doubt>
8. *Shadows of Doubt* — simulation details and criticism (repetition, lack of connective tissue).
   <https://en.wikipedia.org/wiki/Shadows_of_Doubt>
9. Short, E. — *Storylets: You Want Them*; *Beyond Branching: QBN, salience, waypoints*;
   *Montage, Narrative Deckbuilding*; *Mailbag: High-Agency Narrative Systems*.
   <https://emshort.blog/2019/12/03/quality-based-narrative/> ·
   <https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/> ·
   <https://emshort.blog/2017/07/25/montage-and-other-effects-in-storynexus/>
10. de Plater, M. — *Designing Shadow of Mordor's Nemesis system* (DICE 2015). Memory as a
    storytelling device, "anchors of gameplay", avoid filling every case in the middle.
    <https://www.gamedeveloper.com/design/designing-i-shadow-of-mordor-i-s-nemesis-system>
11. Nemesis system patent (US 10,926,179 / related), coverage of remembered characters and
    hierarchy promotion, expiry ~2035.
    <https://thinglabs.io/warner-bros-first-patented-and-has-now-killed-one-of-gamings-best-innovations-the-nemesis-system>
12. Mark, D. — Infinite Axis Utility System / *Behavioral Mathematics for Game AI*; utility vs BT
    vs GOAP vs HTN comparison.
    <https://www.gdcvault.com/play/1018040/Architecture-Tricks-Managing-Behaviors-in> ·
    <https://www.socratopia.app/library/game-code-anatomy-en/chapter-12>
13. Door Kickers — RTwP with free pause, no turns/hexes/AP, randomised enemy placement,
    "no on-rails preferred solution".
    <https://inthekillhouse.com/doorkickers2/> · <https://www.rockpapershotgun.com/impressions-door-kickers>
14. Papers, Please — repetition-as-theme analyses (the tedium *is* the argument), design-pattern
    reading of limited actions and new abilities.
    <https://mycours.es/gamedesign2015/2015/09/23/game-critique-papers-please/> ·
    <https://www.academia.edu/35329919/>
