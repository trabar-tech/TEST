# CIVIC ORDER

A 2D top-down **enforcement-officer simulator** set in an authoritarian city. Bureaucratic
inspection under quota, tactical breach-and-clear, and a record-keeping system that literally
builds the world.

> **Thesis:** you don't choose what to do — you choose what gets *recorded*, and the city is
> built out of records.

**Status:** Phase 1 (The Record) built — one full shift: walk Kiln Row, inspect six citizens, file
the docket, get audited. Gate G0 (three untrained testers) has not been run.
**Target:** single-player · PC · browser-first (WebGL2) · keyboard + mouse.

## Start here

| Doc | What it is |
|---|---|
| [`docs/00-pitch.md`](docs/00-pitch.md) | the game in one page |
| [`docs/01-gdd.md`](docs/01-gdd.md) | the Game Design Document (vision, loop, systems, world, economy, expansion) |
| [`docs/02-systems/00-index.md`](docs/02-systems/00-index.md) | system registry, dependency graph, live status board |
| [`docs/03-production/00-method.md`](docs/03-production/00-method.md) | how docs → game actually runs, and a critique of this process |
| [`docs/03-production/01-roadmap.md`](docs/03-production/01-roadmap.md) | 7 phases, task IDs, acceptance checks, pre-authorised cut list |
| [`docs/03-production/phases/00-phase-index.md`](docs/03-production/phases/00-phase-index.md) | the phase plans: 59 task cards, gates G0–G4, pre-committed failure ladders |
| [`docs/06-research/00-index.md`](docs/06-research/00-index.md) | prior art on director AI, storylets, and what transfers to this game |
| [`docs/04-tech/01-tech-design.md`](docs/04-tech/01-tech-design.md) | web stack, architecture, budgets, determinism, save format |
| [`docs/05-decisions/`](docs/05-decisions) | ADRs: stack, Paper Truth, original IP |
| [`docs/glossary.md`](docs/glossary.md) | canonical vocabulary (in-world + mechanical) |

## The documentation system in one paragraph

Every doc carries front-matter (`id`, `status`, `owner`, `depends_on`, `consumed_by`,
`updated`). Statuses move `draft → review → approved → implemented → deprecated`, and
`implemented` docs get *shrunk* to invariants. Tension is written down as `HYPOTHESIS:` and
settled at a gate. Work is done in `P<phase>-T<nn>` tasks, each with **one unknown** and an
**acceptance check a stranger can run in the browser**. If the build and the doc disagree, the
build wins and the doc is fixed in the same session. Full conventions:
[`docs/README.md`](docs/README.md).

## Running it

```bash
npm install
npm run dev        # http://localhost:5173 — click to walk, click a citizen to inspect,
                   # E opens the desk early, C opens the case file, 1-4 timescale, ` diagnostics
npm run verify     # typecheck + 223 tests (determinism, saves, Record, audit, UI, playthrough)
npm run validate   # content CLI: schema, ids, references, connective-tissue ratio
npm run check:boundaries
```

What exists today is one complete shift. The harness underneath it: a fixed 60 Hz sim, seeded RNG
with save-carried stream positions, an ECS-lite world, A* with body-radius collision, a versioned
save envelope. On top of that, the thing the game is actually about: **the city is simulated from
what you wrote, not from what happened.** The audit catches what the exposure gutter warned you
about, and silence is filed as a hostile claim.

## Content

Game content is data, not prose: `content/examples/content.sample.json` shows the shape of
incidents, directives, citizens, micro-events and report tags.

## Not this

Not a *Half-Life* mod, fan game or asset reuse. The inspiration is the *texture* of an occupied
city; the thesis (*the record is the world*) is our own. See
[`docs/05-decisions/ADR-0003-original-ip.md`](docs/05-decisions/ADR-0003-original-ip.md).
