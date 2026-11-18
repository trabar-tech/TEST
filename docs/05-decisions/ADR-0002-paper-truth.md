---
id: ADR-0002
title: Paper Truth — the player's record is a simulation input
status: accepted
date: 2026-11-18
owner: design
deciders: [design]
supersedes: —
---

# ADR-0002 · Paper Truth

## Context

The concept merges *Papers, Please* (bureaucratic inspection) with *Door Kickers* (tactical
clearing) and *Beholder* (domestic complicity). The naive merge produces **two games in one
build**: a form minigame and a tactics minigame, with a karma slider between them. That is the
single biggest design risk (R2).

We need one mechanic that makes the paperwork *mechanically consequential* rather than
thematically adjacent. It must also be cheap to build (web, small team) and must survive into
the OVERSEER expansion.

## Decision

**The player's written reports are a first-class input to the world simulation.**

1. Every event generates `truth` (computed by the sim) and the player files a `claim` (their
   report). The divergence is **Slack**.
2. The simulation reads **`claim`, never `truth`** — the world's state is built out of beliefs
   (`SectorBelief`), not facts.
3. Witnesses and machines (cameras, dispatch timestamps) can expose Slack; the player is shown
   **exposure** *before* filing, so lies are informed choices, never gotchas.
4. Report lines are **persistent objects** with `stability`, `lifespan`, and witnesses. They decay,
   crack, and can be cited by others forever.
5. **Silence is a claim.** Unfiled events are auto-filed by the audit with the least charitable
   interpretation.
6. Report lines are **queryable data** (`RecordStore`), not UI text.

## Consequences

**Good**
- One thesis unifies both halves: *tactical actions produce paperwork; paperwork produces the
  next tactical situation.* The games are no longer stapled; they are a loop.
- Lying is a resource, not a karma cost — it buys Legitimacy, protection and leverage, and it
  costs Standing risk, which is a *different* currency. No single axis to optimise.
- The OVERSEER expansion becomes a genuine sequel: it queries the archive the player authored,
  and its dilemmas are inherited from the base game for free.
- Cheap to build: JSON + a form + a resolution function. No new rendering tech.

**Bad / risks**
- **Legibility**: a player can feel punished by an invisible algorithm. Mitigated by the
  exposure gutter, stamped consequence sheets, and the "crack" visual.
- **Typing is unlocalisable** and can feel like a tax. Mitigated: fields drive mechanics, free
  text is optional flavour, tag-only fallback.
- **Authority problem**: some players will want an unambiguous "honest path". There isn't one —
  quotas make honesty costly. This is intentional, but it must be *communicated* by fiction early
  (a superior says: *"Nobody expects the truth. They expect a report."*).
- Schema stability is now a product requirement; changing `ReportLine` after OVERSEER ships
  breaks imports.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Karma slider for lies | collapses all tension into one number; makes lying strictly a "cost" |
| Reports affect only dialogue flags | what most games do; makes the desk decorative |
| Ground truth drives the sim; reports are cosmetic | loses the entire fantasy |
| "Lie detector" minigame during filing | turns writing into a reaction test; wrong tone |

## Compliance

- Unit test: a shift with systematic under-reporting produces a `SectorBelief.resistance_estimate`
  that diverges from truth by ≥ 3 after 3 shifts.
- Unit test: `SectorBelief` is computed only from `claim` (no `truth` reads — asserted by an
  import-boundary lint rule on `src/systems/sector/belief.ts`).
- `ReportLine` schema changes require an ADR amendment and a migration.
