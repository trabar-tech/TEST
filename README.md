# CIVIC ORDER

A 2D top-down **enforcement-officer simulator** set in an authoritarian city. Bureaucratic
inspection under quota, tactical breach-and-clear, and a record-keeping system that literally
builds the world.

> **Thesis:** you don't choose what to do — you choose what gets *recorded*, and the city is
> built out of records.

**Status:** pre-production. Docs complete, no gameplay code yet.
**Target:** single-player · PC · browser-first (WebGL2) · keyboard + mouse.

## Start here

| Doc | What it is |
|---|---|
| [`docs/00-pitch.md`](docs/00-pitch.md) | the game in one page |
| [`docs/01-gdd.md`](docs/01-gdd.md) | the Game Design Document (vision, loop, systems, world, economy, expansion) |
| [`docs/02-systems/00-index.md`](docs/02-systems/00-index.md) | system registry, dependency graph, live status board |
| [`docs/03-production/00-method.md`](docs/03-production/00-method.md) | how docs → game actually runs, and a critique of this process |
| [`docs/03-production/01-roadmap.md`](docs/03-production/01-roadmap.md) | 7 phases, task IDs, acceptance checks, pre-authorised cut list |
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

## Content

Game content is data, not prose: `content/examples/content.sample.json` shows the shape of
incidents, directives, citizens, micro-events and report tags.

## Not this

Not a *Half-Life* mod, fan game or asset reuse. The inspiration is the *texture* of an occupied
city; the thesis (*the record is the world*) is our own. See
[`docs/05-decisions/ADR-0003-original-ip.md`](docs/05-decisions/ADR-0003-original-ip.md).
