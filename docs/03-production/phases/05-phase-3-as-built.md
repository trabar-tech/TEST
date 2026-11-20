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
- **The showrunner is not wired into `main.ts`.** It runs headless and is fully tested, but
  the browser's shift loop is still Phase 1's. Wiring it changes the shape of a shift (the
  deck chooses the morning's beats), which is a UI decision that should follow a G2 session
  rather than precede one. The `?inspect` route is therefore also not exposed yet.

## 4. What G2 should watch for

The three pass questions are unchanged. From this build, here is where each one is most
likely to break and what to look at:

1. **Unprompted aliveness (2 of 3).** Watch whether anyone repeats a faction report line
   *spontaneously*. The district currently narrates itself in the Inspector and in the
   briefing, which is passive. If nobody mentions the Cell without being asked, the fix is
   the pre-committed one: raise connective tissue and add epilogues.
2. **Fairness (2 of 3).** Ask "why did that happen?" *without opening the Inspector first*.
   If the tester reaches for it, that is a pass for the machinery and a note that the reasons
   need to reach the surface — the ladder's step 2, the "what the Directorate noticed"
   summary.
3. **Apophenia (2 of 3).** This is the one the build is aimed at. `materialise()` is pure, so
   the person arrested on Tuesday is provably the person from Monday's flat, and the Known set
   is capped at 12. What is missing is *frequency*: nothing yet forces a Known face into a
   shift. If testers cannot name three citizens, the ladder's step 3 (cap 8, force a known
   face every shift) applies directly.

## 5. Verified

```
npm run verify                534 passed / 40 files
npx tsc --noEmit              clean
npm run build                 ✓ 4.56 s
node scripts/check-boundaries ✓ 47 source files, 5 rules
npx tsx scripts/validate-content.ts  ✓ 1 bundle, 0 warnings
```

The validator no longer warns about contradiction cycles — they are enforced now, so they are
content rather than debt. It does now warn when an order has no tags at all, because such an
order can never be satisfied or broken; that check found `dir-0180` (the curfew-pass order)
missing from the act table.
