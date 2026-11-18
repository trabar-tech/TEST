---
id: SYS-INDEX
title: System Registry, Dependency Graph & Status Board
status: approved
owner: design
depends_on: [GDD-01]
consumed_by: [03-production/01-roadmap]
updated: 2026-11-18
---

# System Registry

Read this first, every session. It is the project's single status board.

## Status board

| ID | System | Spec | Status | Phase | Owner |
|---|---|---|---|---|---|
| SYS-CORE-01 | Deterministic tick clock & save | `04-tech/01-tech-design.md` §3 | draft | 0 | tech |
| SYS-TACT-01 | Tactical layer (RTwP, force continuum, breach) | `01-tactical-layer.md` | draft | 2 | design |
| SYS-INSP-01 | Inspection & citizen cards | `02-inspection-and-record.md` §2 | draft | 1 | design |
| SYS-REC-01 | The Record (report lines, Slack, audit) | `02-inspection-and-record.md` §3–5 | approved | 1 | design |
| SYS-SIM-01 | Sector simulation (pop, households, temperature, 12-Known cap) | `03-simulation-and-directors.md` §2–4 | review | 3 | design |
| SYS-DIR-01 | Three directors + Arbiter (storylet decks + pacing FSM) | `03-simulation-and-directors.md` §5–8 | **approved** (ADR-0004) | 3 | design |
| SYS-STORY-01 | Storylet/deck runtime (prereqs, utility scoring, weighted draw, epilogues) | ADR-0004; `06-research/01-...§5` | approved | 3 | tech |
| SYS-ECON-01 | Progression, requisition, household | `04-progression-economy.md` | draft | 2 | design |
| SYS-UI-01 | Desk UI / report form / HUD | `02-inspection-and-record.md` §6 | draft | 1 | design+tech |
| SYS-OVS-01 | OVERSEER expansion | `05-overwatch-expansion.md` | draft | post-1.0 | design |

**Phase** refers to `03-production/01-roadmap.md`. Status semantics are defined in `docs/README.md` §3.

## Dependency graph

```
                    ┌──────────────┐
                    │ SYS-CORE-01  │  (clock, save, determinism)
                    └──────┬───────┘
             ┌─────────────┼──────────────┬───────────────┐
             ▼             ▼              ▼               ▼
      ┌────────────┐ ┌───────────┐ ┌────────────┐ ┌────────────┐
      │ SYS-INSP-01│ │ SYS-TACT-01│ │ SYS-SIM-01 │ │ SYS-UI-01  │
      └─────┬──────┘ └─────┬─────┘ └─────┬──────┘ └─────┬──────┘
            │              │             │              │
            └──────┬───────┴──────┬──────┴──────┬───────┘
                   ▼              ▼             ▼
            ┌───────────────────────────────────────────┐
            │              SYS-REC-01                   │  ← the keystone
            │   (report lines, Slack, witnesses, audit) │
            └───────────────┬───────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
      ┌────────────┐ ┌────────────┐ ┌────────────┐
      │ SYS-DIR-01 │ │ SYS-ECON-01│ │ SYS-OVS-01 │
      └─────┬──────┘ └────────────┘ └────────────┘
            │ uses
            ▼
      ┌──────────────────┐
      │ SYS-STORY-01     │  (storylet deck runtime: prereqs → score → draw → effects)
      │ + Arbiter FSM    │  (4-state pacing, hard budgets)
      └──────────────────┘
```

**Reading the graph:** SYS-REC-01 is the keystone. Every other system either *feeds* it
(produces events that must be reported) or *consumes* it (directors read reports; economy reads
Standing derived from audits; OVERSEER reads the whole archive). This is why the Record is
built in Phase 1 and why its data shape is an ADR.

SYS-STORY-01 is the *second* most reused piece: every director, plus micro-events, directives,
family scenes and epilogue callbacks, is a storylet drawn from a deck. Build it once, as a
library (ADR-0004).

## Interface contracts between systems

These are the only allowed couplings. Anything else is a design smell.

| From → To | Contract | Shape |
|---|---|---|
| TACT → REC | `EventRecord` emitted on scene end | `{event_ref, truth, witnesses[], participants[]}` |
| INSP → REC | `InspectionOutcome` per citizen | `{citizen_id, result, notes[], witness_flags[]}` |
| SIM → DIR | `SectorState` snapshot per shift | `{temperature, factions{}, households{}, coverage}` |
| DIR → TACT | `IncidentCard` | `{archetype, difficulty, map_id, params{}}` |
| DIR → REC | `DirectiveSet` | `{daily[], standing[], quota{}}` |
| REC → ECON | `AuditResult` | `{standing_delta, review_risk, contradictions[]}` |
| REC → SIM | `SectorBelief` (the *believed* world) | see `02-inspection-and-record.md` §5.3 |
| REC → OVS | `CityRecord` (serialised archive) | `04-tech/01-tech-design.md` §6 |

**Rule:** systems do not import each other's internals. They exchange the JSON above through an
event bus, and the bus is the debugging surface (`debug:bus` overlay lists every message).

## Cross-cutting invariants

1. **Everything the player can do produces at most one Report Line** — no double-counting.
   (Prevents audit-exploit loops.)
2. **No hidden state that the player cannot eventually discover.** All sim values that affect
   the player must be observable through some in-game instrument (registry, informant, camera,
   or the street itself).
3. **`truth` is never shown numerically.** Only through what witnesses can attest.
4. **All randomness is seeded per shift** and stored in the save, so a shift can be replayed.
5. **Every content item is data** (`content/*.json`), never hard-coded, because OVERSEER
   re-authoring depends on it.
6. **No black-box directors.** Every systemic decision that affects the player emits its
   candidates, scores and reason to `debug:bus` (`ADR-0004`, "Law of Small Directors").
7. **Fairness doctrine.** No first-visit ambush, no untelegraphed audit punishment, and every
   incident is solvable at force rung ≤2 with at most one recon token. Systemic games are
   allowed to be hostile; they are not allowed to be *unfair* — that distinction is what makes
   the hostility feel authored rather than arbitrary.
8. **Borrow with a trail.** Any mechanism taken from prior art must have a verdict in
   `06-research/00-index.md` §2 and, if architectural, an ADR.
9. **No nemesis drift.** Memory is archival (what was written down), never dramaturgical (a
   rival grown by encounters). See `06-research/01-director-ai-anatomy.md` §6.
