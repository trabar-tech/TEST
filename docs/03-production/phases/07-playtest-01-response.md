---
id: PT-01-RESPONSE
title: "Response to playtest 1 — the conversation is an interview now"
status: review
owner: design
depends_on: [PT-01, PH-1]
updated: 2026-11-18
---

# The conversation, rebuilt (response to playtest 1)

Playtest 1's fair ask was *"greater interactions, good ai"*. An inspection was three fixed
questions answered by a lookup table: a form with dialogue decoration. This is what changed,
and what deliberately did not.

## 1. Pressure — the interaction's only lever

Three manners: **Walk them through it**, **Ask it plainly**, **Lean on them**.

| manner | honesty | answers | cost |
|---|---|---|---|
| gentle | +0.12 | slower, more truthful | none |
| neutral | identity | the form | **nothing** |
| stern | −0.18 | faster, and they say what you want | seen on the street |

`honesty()` is computed from three visible things — temperament, whether their papers are
wrong, and the pressure of the question — so a tester can reason about it rather than guess.

**The manner reaches the desk.** `computeExposure()` gained a `manner` term: leaning on somebody
in the street is exposure *even when the line is honest*. It is added after the "no divergence,
no exposure" rule, capped at 0.3 so it can never be as bad as a lie.

Two things this cost, both worth recording:

- **"Neutral costs nothing" is not a detail.** My first version made neutral cost 0.04 "just in
  case". That broke the invariant that an honest, plainly-asked line is invisible — a rule
  already in `AGENTS.md`. Caught by the test that asserts it.
- The pressure *choice* is only real because the cost is visible in the exposure gutter. A
  manner control that changed nothing at the desk would be a toggle, not a decision.

## 2. Follow-ups — the transcript is the map of what you may ask next

Ten questions: five primes, five that exist only because of something already said.

- `which_gate` — needs a route mentioned.
- `who_told_you` — needs a line that leaked a rehearsed tell.
- `why_not_supervisor` — needs a shift boss named.
- `again_slower` — opens after any answer; the pressure move.
- `who_else_knows` — needs a neighbour or a gate.

This is the mechanism that turns a checklist into an interview: **how you spend three answers
decides what you can ask.** A player who asks the form gets a form; a player who asks the gate
gets a follow-up that can be caught out.

Follow-ups are answered **out of the transcript** (`derive`), not from a stored table —
`again_slower` rephrases the previous answer, because honest people rephrase and rehearsed
people do not, and the difference is the tell.

## 3. Tells belong to a line

Previously every answer from a rehearsed person carried the same flag, which made the tell a
property of a *person* — a stat, not a notice. Now the flag is rolled per line, and the panel
prints **its meaning** rather than its code:

> *They repeated it too exactly. That is not how memory works.*

Leaning on somebody raises the leak chance, so pressure buys information and costs truth. That
trade is the whole interaction.

## What this is not

- **Not an AI.** Citizens still have routines and a temperament; they do not pursue goals. The
  playtest wanted "good ai" and this does not provide it — it provides conversations that
  respond to what you do, which is a different and smaller claim.
- **Not more verbs.** You still walk, talk, check papers, and file. What changed is that talking
  is now an act with a cost, not a formality before the form.
- **Not tested by a human.** Everything here is verified by 24 new tests and in the preview.
  Whether it *feels* like an interview is a G0/G2 question and nobody has run either.

## The honest position on "a top-down shooter"

`06-playtest-01.md` records the mismatch. Nothing in this commit moves the game towards a
shooter; it moves the *interview* towards being an interview. If the intended game is the
tactical one, that is a design decision that should be made explicitly and would invalidate
most of Phase 3 — and the repo should say so rather than drift.
