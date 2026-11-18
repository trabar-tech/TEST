---
id: PROD-RISK
title: Risk Register
status: reviewed
owner: production
depends_on: [PROD-ROADMAP]
consumed_by: [03-production/01-roadmap]
updated: 2026-11-18
---

# Risk Register

Ranked by `impact × likelihood`. Reviewed at every gate. A risk with no mitigation and no test
isn't a risk, it's a future apology.

| # | Risk | Impact | Likelihood | Earliest signal | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R1 | **The Record isn't fun** — filing feels like homework; players want to skip to the tactics | fatal | med | G0 testers skim the form / type nonsense | simplest possible form first; exposure gutter as the tension; free text optional; cut to 6 decisions | design |
| R2 | **Two games stapled together** — RTwP tactics vs. bureaucratic desk | high | med | G1: testers describe them as separate games | one timescale engine, one order vocabulary, the Record reads tactical events ("clear is a claim") | design |
| R3 | **Web performance ceiling** — 40 agents + sim + shadows at 60 fps | high | med | Phase 0/2 profiling | 2D top-down, sprite atlas, no per-pixel lighting, sim budget <15 ms, cap agents | tech |
| R4 | **Tonal misstep** — reads as either edgy provocation or toothless | high | med | G0/G2 barks and notices | grounded, bureaucratic voice; no glee; civilian interiority; sensitivity read | narrative |
| R5 | **Docs rot** — stale specs cause confidently wrong builds | high | **high** | a mismatch between doc and build found twice | status/updated discipline; shrink `implemented` specs; build wins + reconcile same session | production |
| R6 | **Scope creep from the expansion** — OVERSEER features leak into base game | med | high | any "just in case" abstraction | 5 architectural rules only; everything else post-1.0 | production |
| R7 | **Quota/temperature spiral untunable** — either trivially winnable or unwinnable | high | high | Act II playtests | tune **last**; expose parameters in JSON; 3 difficulty presets; one de-escalation lever always available | design |
| R8 | **Papers-Please repetition** by shift 5 | med | high | G2 | conversation tells, not pixel-hunts; ≥4 temperaments; rotate checks; author 60 micro-events | design |
| R9 | **Free-text localisation & safety** — typed text is unlocalisable, unfilterable, unbounded | med | med | pre-Phase 5 | 240-char cap, plain text only, no network; tag-only fallback mode; EN-only at 1.0 | tech |
| R10 | **Determinism bugs** — replays/saves drift, OVERSEER recomputation diverges | med | med | P0-T02 hash test | seeded RNG only, no `Math.random` (lint rule), state hash test in CI | tech |
| R11 | **Content volume underestimated** — 60 events, 80 directives, 5 maps is a lot of authoring | med | high | Phase 3 | spreadsheet pipeline + schema validation; procedural variants of authored templates | production |
| R12 | **Moral legibility** — player can't tell why they were punished | high | med | G1 | exposure gutter, stamped consequence sheet, crack visual, "why was I flagged" tool | design |
| R13 | **Solo slow-mo trivialises combat** | med | med | G1 | Focus slows movement, not reaction; stamina cost; disabled in heavy weapon scenes | design |
| R14 | **Single-player only, no virality** — discoverability | med | high | pre-release | the hook must be marketable: "you choose what gets recorded" is a trailer line | production |
| R15 | **Burnout / session loss** — long project, many interruptions | high | high | any time | phases end in playables; docs as external memory; every session ends with a status note | production |
| R16 | **Nemesis-pattern overlap** — grudges/faction memory drift toward a patented "remembered rival with promotion" system | high (legal) | low-med | any feature that makes an NPC "come back improved" | hard boundary documented in `06-research/01-...§6`; review any grudge feature against the DO/DON'T table before building | design |
| R17 | **Director opacity** — a utility-scored deck feels arbitrary to players ("why did that happen?") | high | med | G2 testers can't explain why the day got worse | transparent *purpose* + opaque maths; the player can always name the director's motive; score inspector for devs; post-shift "what the Directorate noticed" summary | design |
| R18 | **Thin content pool** — 60 storylets exhaust in 6 shifts despite good architecture | high | high | archetype repetition logged at G2 | connective-tissue budget (≥40% reference prior state); procedural variants of authored templates; epilogue reuse makes old content feel new | production |
| R19 | **Over-fitting to research** — copying L4D/RimWorld patterns where our genre differs (e.g. intensity-based difficulty in a game about *incompetent* systems) | med | med | designers citing "because Valve did it" | every borrowed idea must pass the originality/justification test in ADR-0003; the research ledger records verdicts, not just sources | design |

## Triggered risks log

*(append when a risk fires: date · risk · what happened · decision · doc updated)*

| Date | Risk | What happened | Decision |
|---|---|---|---|
| 2026-11-18 | — | Project start. No risks fired. | Docs system established; Record made Phase 1. |
