# Phase 3 — as built: the spine, the district, and the directors

> **Gate status:** **G2 NOT RUN.** Same standing as G0 and G1: no human has played this.
> Everything below is machine-verified (491 tests, clean typecheck, clean build, boundaries
> clean, content valid) and none of it is evidence that *the city feels alive*. G2 asks
> three questions that only a person with a notepad can answer, and this document does not
> pretend otherwise.
>
> The phase plan (`04-phase-3-sim-directors.md`) is unchanged and remains the authority on
> scope and exit criteria. This document records what was actually built, what was
> deliberately not, and what a G2 session should watch for.

---

## 1. What landed

| Task | Card | Delivered as | Tests |
|---|---|---|---|
| P3-T04 | Storylet runtime (`SYS-STORY-01`) | `src/systems/storylets.ts` | `tests/storylets.test.ts` (27) |
| P3-T01 | Household records + per-shift tick | `src/systems/households.ts` (`generateSector`, `legitimacy`, `temperature`, `grade`) | `tests/households.test.ts` (29) |
| P3-T02 | Materialisation + 12-Known cap | `src/systems/households.ts` (`materialise`, `KnownSet`) | same |
| P3-T05 | Desk fault-line weighting | `src/systems/directors.ts` (`observe`, `chooseDirectives`) | `tests/directors.test.ts` (34) |
| P3-T06 | Arbiter pacing FSM | `src/systems/directors.ts` (`arbitrate`) | same |
| P3-T07 | Oversight Attention + Eye ladder | `src/systems/directors.ts` (`notice`, `eyeTick`) | same |
| P3-T08 | Cell HTN-lite plans + grudges | `src/systems/plans.ts` | same |
| P3-T03/T10/T12 | Composition + the Inspector | `src/systems/showrunner.ts`, `src/ui/inspector.ts` | `tests/showrunner.test.ts` (21), `tests/ui-inspector.test.ts` (13) |
| P3-T03 tail | The street speaks its grade | `src/systems/mood.ts`, `Barks.forGrade`, `barks.json#by_grade` | `tests/mood.test.ts` (13) |
| P3-T02 (wire) | The street **is** the district: stable homes, learned by inspection, filed lines make people Known, and incidents carry a `householdId` | `src/systems/citizen-homes.ts`, `Simulation.homeOf/knownCandidate/attachHousehold`, desk `THE HOUSEHOLD` panel | `tests/citizen-homes.test.ts` (29), `tests/ui-desk-home.test.ts` (4) |
| P3-T01 (reaction) | The district reacts to filings, and hardens | `src/systems/household-reaction.ts`, wired in `main.ts` | `tests/household-reaction.test.ts` (19) |
| P3-T01 (mood) | Citizens carry their household's mood | `Citizens.effectiveDread`, `Simulation.setSector` | `tests/citizen-homes.test.ts` (+5) |
| P3-T02 (recur) | Known faces return every shift, with a reason, and **host the raid** | `src/systems/recurrence.ts`, briefing + incident host in `main.ts` | `tests/recurrence.test.ts` (21) |
| P3-T02 (UI) | The Registry screen | `src/ui/registry.ts`, persisted Known set in `main.ts` | `tests/ui-registry.test.ts` (14) |
| P3-T04 (live) | The 12 storylets fire in the browser | `src/systems/scene-log.ts`, `src/ui/scene.ts`, draw + play in `main.ts` | `tests/scene-flow.test.ts` (19) |
| P3-T11 | Contradicting standing orders, enforced | `src/systems/directive-conflicts.ts`, audit `directive` findings, desk warning, `main.ts` order rotation | `tests/directive-conflicts.test.ts` (21), `tests/orders.test.ts` (7), 2 in `tests/ui-desk.test.ts` |
| P3-T10/T11 (partial) | Content | `content/examples/content.sample.json`: 12 micro-events (8 + 2 epilogues + 2 prior), 22 directives | `tests/phase3-content.test.ts` (9) |

**The spine went first, on purpose.** The phase doc says every director is a deck, so the
deck came before the directors. The consequence is that P3-T01..T08 are all *consumers* of
one runtime with one scoring function and one trace format — and therefore one place to debug
when G2 says "this feels random".

## 2. Decisions taken during the build

**The Inspector is player-facing, not a dev overlay.** The task card (P3-T09) says "dev
overlay". Building it that way would have missed the actual failure mode: the G2 fairness
question is asked *by a tester*, and a tester who cannot answer it says "the game just
decided to punish me" (RISK R17). So `inspectShift()` returns the same arithmetic the
director used, and `createInspector()` renders it in plain sentences: temperature and why it
moved, the Desk's opinion of your habits, the Arbiter's budget and its reason, Oversight's
attention and what was noticed, then every card considered with its four factors — including
the cards that were **ruled out and the clause that ruled them out**. A director that cannot
explain itself in one screen is a bug in this design, not a tuning problem.

**`RELEASE` outranks every other transition.** The documented FSM puts lethal force on the
BUILD → RELEASE edge only. That makes a death on a calm shift invisible: nobody consumed
three storylets, so no release. `arbitrate()` now enters RELEASE from any state when force
≥ 6 or anyone died, and keeps it for a full shift. This was caught by the showrunner tests,
not by the doc — the doc's table is ambiguous and this is the reading that matches its prose
("forced quiet content … no threats for 1 shift").

**Eviction replaces, it does not empty.** The first implementation of the roster's "visible
gap" reported empty slots after an eviction. That was wrong and the UI test caught it: the
set stays at 12, so nothing is ever visibly empty. The loss is *the person*, so the panel now
says "3 people have gone out of your head — h-014, h-002, h-031. They are still out there."
What the player loses is a name, not a slot.

**Director vocabulary is now schema, not convention.** `pressure`, `fault_lines`,
`temperature_band` and `archetype` were being *stripped* by `StoryletSchema` — the scorer read
them defensively with `as` casts, so authored values vanished silently on parse and every card
scored as a default. They are now first-class fields on `StoryletSchema`. This is the class of
bug that makes a director look broken while testing fine, and the schema change is what fixed
it. `claim` codes are also now authoring-checked against the record layer's legal set
(`P C D X B - R NR`).

**A district with nobody in it reports 0, not 50.** `temperature()` on an empty household list
divided nothing by nothing and returned the neutral band. Zero is the honest answer: an
evacuated district is not half-hostile.

## 2a. The street and the district are the same people

Until this commit they were not. `materialise()` was pure and tested, and the six
citizens on the street were authored in a *different file* from the sixty households —
so the sim doc's promise ("the person you arrest on Tuesday is the mother from the flat
you cleared on Monday") was **provably false in the running game**. Purity without a
binding is a property of a function, not of a world.

`src/systems/citizen-homes.ts` binds them:

- **A stable home.** `homeFor()` seeds the assignment from `(campaign seed, citizen id)`
  and prefers a household in the same block as the citizen's post (`laundry` →
  `laundry_yard`), so the street's geography does not lie about where people sleep. It
  uses the *citizen* stream, not the household stream, so growing the district from 60
  to 40 cannot re-home anybody.
- **Learned, not assumed.** The home appears on the docket note and in a `THE HOUSEHOLD`
  panel on the desk, beside the evidence — because "do I file a line naming this
  household?" is the actual decision, and decisions belong next to their evidence.
- **A visible disagreement.** `describeDiscrepancy()` compares the card the citizen
  carries against the household registration and reports the gap at the severity the
  papers already show. A crowded class-D household with an over-classed card is a line
  the Warden can write, and it is never a hidden fact.
- **The rule, in one place.** One conversation is not a relationship; two, or a filed
  line naming them, puts the household in the Known set. `knownReason()` owns that test
  so the sim cannot encode it twice and drift.

The loop now closes end to end: inspect → the home is visible → file a line → the
household enters the Known set → the Registry shows a new face → the *same record* can
be materialised as the person in the flat next Monday. That is the continuity the design
claims, and it is now true of the same data rather than of a sentence in a document.

## 2c. The district reacts, and it does not forgive quickly

§2a bound the street to the district so the player could learn where people live. This is
the other direction, which is where "the city remembers" stops being a claim.
`src/systems/household-reaction.ts`:

- **Only claims count.** A household reacts to what was *filed*, never to what happened.
  That is not a limitation, it is the thesis: the city is what the paperwork says it is. A
  brutality nobody wrote down did not, officially, occur.
- **Neighbours feel a third of it.** Punishment that only touches one door is a queue, not
  a district. Same block, `NEIGHBOUR_SHARE` of the delta.
- **It does not wash off.** A detention is +0.22 grievance, a clear is −0.06. Punishment
  outlasts kindness by a factor of nearly four, which is why the place degrades under
  pressure instead of merely oscillating.
- **Order-independent.** The delta is the sum over acts, so filing the same three lines in
  a different order cannot produce a different city — a property the tests assert directly.

It then feeds `legitimacy()` and `temperature()`, so a bad night is visible in the street's
grade and its barks, not just in a number nobody sees. And grievance *hardens*: at 0.7 a
household becomes `available`, which is exactly what the Cell's recruitment step looks for.
The loop is now: you file → the district hardens → the Cell recruits from it → the Cell
strikes → you respond. That is the ratchet the whole sim exists to produce.

## 2d. People wear their district

The last seam in §2c's list: a frightened man from a household the Cell has recruited looked
exactly like a frightened man from a quiet one. `Citizens.effectiveDread()` now adds the
household's mood to the authored temperament, so grievance is visible on a body on the street
before anybody reads a number. A household flagged `available` lifts harder, because a person
from an angry house is not only afraid.

The bug this turned up is worth keeping: the first version computed `base * 0.6 + lift`
unconditionally, which meant a shift with **no district** quietly lowered every citizen's dread
by 40%. The pure Phase 1 slice must not become a calmer place because Phase 3 introduced a
lift, so `effectiveDread()` now returns the authored value untouched when there is no
household — and the test that caught it asserts exactly that.

## 2e. The twelve come back

The 12-Known cap is a budget for apophenia, and it was spent on nothing: a Warden could learn
twelve names and never meet any of them again. `src/systems/recurrence.ts` closes that.

Once per shift it answers *who is in the news*, and the briefing prints it as a line with a
reason:

> SOMEONE YOU KNOW — Somebody from tenement row has been asking which way the patrols come.

The weighting is written down rather than tuned by feel, and each term is a thing a player can
name: a Known household outranks an unknown one (×3.2) because the player can put a name to
them; an `available` household outranks a quiet one (×1.8) because the Cell has been to their
door; a live grudge outranks both (×2.4) and says what it is about. **`preferKnown` defaults to
true** — with at least one Known household, that household is guaranteed to come up, which is
ladder step 3 (the G2 failure fix for apophenia) implemented rather than documented. When
nobody is Known yet the district supplies its own news, which is the honest answer on a
Warden's first shift.

`rankRecurrence()` is exported separately from the draw for the same reason `trace()` is: the
answer to "why her?" has to be inspectable. And `lineFor()` never returns a status — a
household is a fact, a line is a story, and only the second one is worth reading on a briefing
screen.

## 2f. The raid goes to the household in the news

§2e made a Known face *appear*, in a line on the briefing. It still did not make them
*somewhere*: the flat raid went to a fixed authored address from a map file, so the person
the briefing named and the door the Warden came through were unrelated. Recurrence was
correct and decorative.

`hostForIncident()` closes it. The incident is now hosted at the household the briefing
named, the address reads `Block C, flat fourteen · tenement row h-001`, and the docket
card carries a `householdId` — which means **a raid is charged to the district reaction
exactly like an inspection is.** Force used on a household the Cell recruited from, on a
household the Warden can name, now raises that household's grievance and its neighbours',
which raises the temperature, which changes the barks. The loop is closed at the level of
the actual scene rather than only at the level of the paperwork.

The host and the news are deliberately *separate* functions (`chooseRecurrence` vs
`hostForIncident`) even though one currently calls the other: what the Warden *hears* and
where they *end up* are different questions, and keeping them separate is what stops the
game feeling like it is reading out its own dice.

A local variable was named `host` for about ninety seconds and shadowed the app's DOM mount
point. Same class of bug as the `nextShift` collision in Phase 2b; renamed to `raided`, with
the incident recorded in the commit message because the next person to write
`const host =` in `main.ts` deserves the warning.

## 2g. The storylets fire

Twelve authored storylets had been sitting in the content bundle since Phase 3 began,
scored by a runtime with 27 tests, and **never once shown to a player.** That is the most
expensive kind of completeness: a system that is correct in isolation and absent in fact.

They are live now:

- `src/systems/scene-log.ts` — the shift's cards, what was played, and the effects the
  resolutions wrote. Deliberately not a view: the deck knows nothing about DOM, the view
  knows nothing about decks, and the seam between them is three fields.
- `src/ui/scene.ts` — beats in prose, then the resolutions as things an officer would say
  out loud, then a closing line stating plainly that *the choice still has to be written
  up*. No numbers anywhere: a scene is a situation, not a spreadsheet.
- `main.ts` draws on the beat opening (two cards on shift 1, one thereafter) and plays them
  with 900 ms of air between, so two cards never stack.

A scene's choice reaches the district: the authored `legitimacy` on each resolution moves
grievance, and the closing line goes out on the radio. The flag and epilogue effects feed
`sim.effectState`, which the deck reads — so `me-03-press` scheduling `epi-01-press-moved`
now actually schedules it.

**A real bug fell out of wiring it.** The docs claim `pressure ≥ 0.5` is *refused* by a
RELEASE shift; `pacingFit()` only multiplied it by 0.15, and under a deterministic weighted
draw a discounted card still gets picked. Release was decorative. `scoreCard()` now returns
`eligible: false` with the reason `"pressure 0.5 is too sharp for a release shift"`, which is
what the Arbiter's promise actually requires.

Two name collisions in one commit, both caught by the compiler rather than by play:
`createScene` already existed in the renderer (aliased to `createStoryScene`), and
`pressureFromIndex` lives in `tactical/force` rather than `sector`. The first is the third
collision of this kind in the project; the lesson has been written into `AGENTS.md` as a
standing warning about `main.ts`.

## 2h. The debrief answers for the district

The compliance sheet is the *audit's* voice, and the audit has no opinion about
households. So after a raid was charged to a household (§2f), the only trace the player
got was a number that had already moved by the time the next briefing drew. The world
looked like it was not tracking anything.

The debrief now has a second panel, after the belief rows and before tomorrow's briefing —
the order a person actually thinks in: what the paperwork says, then who it landed on,
then what happens next. It carries the district's sentence in its own words
(`kiln row is angry, and the neighbours are watching`), the household that took it worst,
and the line *"They will be in the briefing"* — which is true, because §2e guarantees it.

**Wiring this found the thesis quietly not applying.** The district's reaction used to run
*before* `submit()`. But `submit()` is what auto-files every incident the Warden left no
line for, so those lines did not exist yet when the district was asked to react. The one
behaviour the game most wants to punish — leaving the paperwork empty — cost the district
nothing. Reaction is now captured from the pre-audit docket, auto-filed lines are added to
the acts, and the result is applied after the audit. A refusal written by the desk angers
a household exactly as much as one written by hand, which is the point: the household
cannot tell the difference.

A related silent drop: `attachHousehold` returned early when no district was loaded,
discarding the `householdId` entirely. The id is a fact about where the incident happened;
only the readable block name needs the district. It is now kept even with no sector, so a
raid cannot be free just because a map loaded before the district did.

## 2b. Standing orders are now a rule, not a comment

The contradiction graph was detected and warned about since Phase 0 and **enforced by
nothing**, which made it a comment. `src/systems/directive-conflicts.ts` closes that, and the
mechanism is deliberately narrow:

- A directive carries `tags`: the *acts* it requires. `DIRECTIVE_TAGS` fills in the existing
  twenty-two orders so they could be scored without an authoring pass; `DirectiveSchema` now
  has a `tags` field for authors who want to say it themselves.
- Two live orders conflict when they name each other in `contradicts` (the interesting kind,
  where both halves are individually correct) or when they demand the same act.
- A filed line performs acts, derived from its tags and its classification. `expandActs()`
  maps *noticing* tags to *act* vocabulary — and that mapping is the bug that had to be found
  by hand: the desk tags an inspection `insufficient_papers`, while the order talks about
  `inspection`, so the first version of the warning never fired for any real filing.

Then: obeying two conflicting orders is charged on the sheet (`kind: 'directive'`, weight 0.35
for both halves, 0.2 for one), it destabilises the line, and it can tip a clean shift into
Review. Crucially the desk shows **`conflictWarnings()` before signing** — a contradiction the
player only meets on the audit sheet is a trap, and traps are what this design forbids.

It is live in the browser: `main.ts` issues three orders a shift and always draws the partner
of any order it picked, so shift 1 opens on a real dilemma — `dir-0180` requires curfew-pass
checks, `dir-0197` suspends them and demands visible patrol instead. `tests/orders.test.ts`
pins that rotation and asserts contradictions do not stack on most nights.

The G2 question this is aimed at is #2 (*fairness*): the player should be able to say "I
broke the curfew order because the Directorate contradicted itself, and here is the line that
says so."

## 3. What is deliberately not built

- **Campaign temperature in the bark selector (P3-T03 tail, partially closed).** The *street*
  now speaks its grade: `src/systems/mood.ts` reads the saved sector memory, and every other
  ambient line is a graded bark (`barks.forGrade()`, four voices per grade in
  `content/examples/barks.json`). What is **not** wired is the campaign formula from
  `households.ts` — the street reads force and shifts out of `GameState.flags`, because the
  campaign layer does not run in the browser yet (see below). When the showrunner goes live,
  `streetGrade()` should take its number from `temperature(sector)` instead of the ratchet.
  The vocabulary is already shared, so this is a one-line change of source, not of shape.
- **Content volume.** 12 storylets vs. the 60 the card asks for; 22 directives vs. 80. The
  cut line explicitly permits this and prefers it: *micro-events 60→30* before households go
  to 40. What exists is a *representative slice* that exercises every schema feature
  (bands, references, an epilogue chain, a contradiction cycle) rather than a volume of
  interchangeable cards.
- **The Congregation and the Syndicate.** Only the Cell has a plan engine. `PlanDef` is
  faction-keyed, so the other two are data, not code — but they are not written.
- **Directive contradiction resolution: now enforced** (was the head of this list). See §2b.
- **Directive *quotas* are not measured.** Acts are scored; the numbers on a `daily` order
  (forty inspections, sixteen arrests) are still prose. That is the next honest step for this
  system and it needs the shift's tally, which currently lives in `main.ts`.
- **The district's sentence is not yet quoted back at the briefing.** It lives on the
  debrief, which is where a player looks immediately, but a tester who skims may only read
  the radio toast. Worth checking in G0 before adding a second place to say it.
- **Scenes are one card deep per shift.** The deck draws two cards on shift 1 and one
  thereafter, and a card is played on the street before the desk. There is no *between*-shift
  economy for a scene yet: its legitimacy touches the district, but its `standing` and
  `integrity` totals are computed and not yet spent anywhere (standing is Phase 4's currency).
- **Only one site can be hosted.** The flat is bound to a household (§2f), but the canal-market
  crowd is still an authored anchor and only accepts a household id nobody supplies. The
  generic version — an incident *deck* whose cards carry a `host` requirement — needs the
  60-storylet pass to be worth building.
- **The Registry screen is the only campaign surface in the browser.** `R` (or `?registry`)
  opens it: twelve faces with the household line and why each is known, the rest of the
  sector as anonymous records, and a column of people who have gone out of your head.
  Visiting a household materialises them and takes a slot. The Known set is persisted on
  `GameState.flags`, so a reload cannot reset the apophenia budget.
- **The showrunner is not wired into `main.ts`.** It runs headless and is fully tested, but
  the browser's shift loop is still Phase 1's. Wiring it changes the shape of a shift (the
  deck chooses the morning's beats), which is a UI decision that should follow a G2 session
  rather than precede one. The `?inspect` route is therefore also not exposed yet.

## 4. What G2 should watch for

The three pass questions are unchanged. From this build, here is where each one is most
likely to break and what to look at:

1. **Unprompted aliveness (2 of 3).** The street now interrupts: scenes open with their own
   prose, and a choice leaves a line on the radio. Watch whether a tester describes the
   district as *doing things* rather than *showing things* — the scenes are the main new
   surface for that, and two cards in a whole shift may not be enough. If nobody volunteers
   an event unprompted, the fix is still the pre-committed one: raise the connective-tissue
   ratio and add epilogues.
2. **Fairness (2 of 3).** Ask "why did that happen?" *without opening the Inspector first*.
   If the tester reaches for it, that is a pass for the machinery and a note that the reasons
   need to reach the surface — the ladder's step 2, the "what the Directorate noticed"
   summary.
3. **Apophenia (2 of 3).** This is the one the build is aimed at. `materialise()` is pure, so
   the person arrested on Tuesday is provably the person from Monday's flat, the Known set is
   capped at 12, and the Registry screen is where a tester can actually look at the names.
   Every leg of this is now built: the six people on the street are six of the sixty, filings
   change the district, citizens wear their household's mood, a Known face is **guaranteed to
   return every shift** with a printed reason (§2e), and **the raid happens at their door**
   (§2f) — so the person in the briefing is the person behind the door you came through, and
   the district is charged for it. If testers still cannot name three citizens at this point,
   the machinery is not the problem and the answer is content volume, not more systems.

## 5. Verified

```
npm run verify                651 passed / 47 files
npx tsc --noEmit              clean
npm run build                 ✓ 4.56 s
node scripts/check-boundaries ✓ 54 source files, 5 rules
npx tsx scripts/validate-content.ts  ✓ 1 bundle, 0 warnings
```

The validator no longer warns about contradiction cycles — they are enforced now, so they are
content rather than debt. It does now warn when an order has no tags at all, because such an
order can never be satisfied or broken; that check found `dir-0180` (the curfew-pass order)
missing from the act table.
