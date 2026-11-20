# Working on this repository

Read this before you touch anything. It exists because more than one agent session can
write to this repository, and the failure mode is not a merge conflict — it is two sessions
producing parallel judgement documents about the same code, and a human having to reconcile
two opinions after the fact.

## Branch rules

1. **Work only on your own branch.** Yours is named in your session; do not create, switch
   to, or push another.
2. **Never force-push.** Not `--force`, not `--force-with-lease`, not `+refspec`. A rejected
   push is information; an overwritten push destroys someone else's session.
3. **Never push to `main`.** `main` moves only when the human merges, deliberately.
4. **Pull before you assume.** `git fetch --all && git ls-remote origin` tells you whether
   another session is active. If a ref you did not create has moved, say so in your next
   message instead of planning around it.

## Contended files

These are shared surfaces. Touch one only if your task names it, and check
`git log --oneline -3 <file>` first so you know what you are building on:

- `src/main.ts` — the browser wiring; every phase adds to it
- `src/systems/shift.ts` — the shift object; the widest interface in the codebase
- `content/examples/content.sample.json` — shared content; validate after editing
- `docs/03-production/01-roadmap.md`, `docs/03-production/phases/00-phase-index.md`,
  `README.md` — status surfaces; keep them true rather than aspirational

**Safe in parallel:** new files under `src/systems/`, new tests, new docs, new content
files. A task that only *adds* a file cannot collide.

## The one rule that matters more than the branch rules

This project's value is in its documented judgement — what was built, what was deliberately
cut, and why. Do not write a plan that reads as if the work is done, and do not mark a gate
as passed. **G0, G1, G2 and every later gate are run by humans.** If a document says a gate
passed and no human ran it, the document is lying and should be fixed in the same commit.

## Before you commit

```
npm run verify                 # typecheck + tests
npm run build                  # the preview must still boot
node scripts/check-boundaries.mjs
npx tsx scripts/validate-content.ts
```

All four green, or say which one is not and why.

## The ordering trap (learned the hard way, twice)

`submit()` is not a pure reads-and-decides call: it *writes* auto-filed lines for every
incident left unfiled. Anything computed from `sim.record` beforehand sees a smaller world
than the audit does. When the district reaction ran before `submit()`, leaving the
paperwork empty cost the district nothing — the game's central claim, quietly false, with
a green test suite.

Before computing anything from the record at desk-close, ask: *has submit() already run?*
If not, either compute after, or capture the act list and explicitly union the auto-filed
lines.
