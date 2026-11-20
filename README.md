# CIVIC ORDER

A 2D top-down **enforcement-officer simulator** set in an authoritarian city. Bureaucratic
inspection under quota, tactical breach-and-clear, and a record-keeping system that literally
builds the world.

> **Thesis:** you don't choose what to do — you choose what gets *recorded*, and the city is
> built out of records.

**Status:** Phases 1 and 2 built. One full shift: walk Kiln Row, inspect six citizens, file the
docket, get audited — and, at either of the two marked corners, go into a flat and clear it, then
file *that* on the same docket. Gates **G0 and G1 have not been run** (both need three human
testers; see `docs/03-production/phases/02-phase-1-record-slice.md` §6 and
`03-phase-2-tactical.md` §6d).
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
                   # E opens the desk early, C opens the case file, F enters the flat,
                   # 1-4 timescale, ` diagnostics
npm run verify     # typecheck + 572 tests (determinism, saves, Record, audit, tactical, UI)
npm run validate   # content CLI: schema, ids, references, connective-tissue ratio
npm run check:boundaries
```

What exists today is one complete shift, the tactical layer that feeds it, and (headless) the
Phase 3 simulation behind it: a 60-household district, three directors, and the storylet deck
they draw from. The district's temperature is never shown as a number — the loudspeaker and the
ambient lines change with it, so the street tells you what kind of day it is.

The six people on the street are six of the district's sixty households: inspecting someone
tells you where they live, the desk shows it beside the evidence, and filing a line naming
them puts that household in your Registry. The person you arrest on Tuesday is the person
from Monday's flat, because they are the same record.

Each shift the Directorate issues three standing orders, and some of them contradict each
other: obeying both is charged on the audit sheet, and the desk's exposure gutter warns you
before you sign.

**Key bindings:**
on the street — click to walk, click a citizen to inspect, `E` the desk, `C` the case file,
`R` the Registry (who you know, and who you have lost), `F` the flat, `1`–`4` timescale,
`P` the playtest script, `` ` `` diagnostics. `?registry` opens the Registry directly. Append `?playlist`
to the URL to run the G1 session (`docs/03-production/phases/02b-phase-1-2-debt.md`).
In an incident — `1`–`8` are the eight orders (hold, move, stack, breach, clear, detain, escalate,
withdraw), `Esc` ends it, clicking an order chip moves it to the front of the queue,
shift-clicking drops it, and holding the **right mouse button** is Focus when you have no squad.

The tactical layer's one rule, visible on the incident screen: **the form never leaves the frame.**
A "will be filed" strip runs down the right of the plan while you are still deciding, so choosing
the shotgun is visibly choosing a sentence in a report. The audit then reads the scene's own log —
the noise a neighbour heard, the door you took off its frame, the man nobody found — and an honest
line never meets it (guaranteed by `tests/tactical-honest.test.ts`: 7 honest scripts × 25 seeds).

The harness underneath it: a fixed 60 Hz sim, seeded RNG
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
