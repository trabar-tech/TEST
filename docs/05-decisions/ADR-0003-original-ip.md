---
id: ADR-0003
title: Original IP — the Half-Life 2 line
status: accepted
date: 2026-11-18
owner: design
deciders: [design]
supersedes: —
---

# ADR-0003 · Original IP

## Context

The concept was pitched as a "Metrocop simulator" inspired by *Half-Life 2*'s opening chapters,
*Half-Life: Alyx*'s occupied-city texture, *Papers, Please*, *Beholder*, and *Door Kickers*. The
inspiration is tonal and mechanical. The risk is producing (a) an unlicensed derivative, or
(b) a game that feels like a mod — a reskin without its own thesis.

## Decision

We ship **CIVIC ORDER**, set in the city of **Vess** under the **Directorate**, with the
**Emergency** as the in-fiction justification for indefinite rule. All naming, iconography,
faction design, ideology and vocabulary are original and catalogued in `docs/glossary.md`.

**What we take (abstract, unprotected):** the *feeling* of ground-level authoritarianism; a
loudspeaker-mediated city; a masked civil-enforcement corps; citizens queuing under scrutiny;
the mechanical rhythm of inspection under quota.

**What we never take (specific, protected):** names (City 17, Combine, Civil Protection, Breencast,
Overwatch, Gordon Freeman, the Citadel), the lambda/Combine insignia and any logo, distinctive
uniform silhouettes, alien species/technology, specific lines of dialogue, the *Half-Life*
narrative, and the *Half-Life: Alyx* level design.

**The originality test we apply to every element:** *can we state the design thesis it serves?*
For CIVIC ORDER the thesis is **"the record is the world"** — a claim *Half-Life* never makes.
Any element that exists only to evoke *Half-Life* is cut. This is the difference between
"inspired by the texture of occupied cities" (legitimate, and how every genre works) and
"recreating City 17" (not).

## Consequences

**Good**
- Clean IP position; the game can be sold, streamed, and expanded without negotiation.
- The mechanical thesis gives the game its own identity; comparisons become "X meets Y", which
  is marketing, not derivation.
- Our own vocabulary (Directorate, Warden, the Ledger, Oversight) is consistent and ownable.

**Bad**
- Loses the instant recognition of a familiar setting; marketing must do more work.
- Requires disciplined art direction to reach the "occupied city" mood without the reference
  language — solved by researching *real* 20th-century occupation photography and municipal
  architecture rather than other games.

## Compliance

- Art/reference board must contain **no** game screenshots from referenced titles; use
  photographic and architectural references instead.
- A naming checklist review each phase: every new proper noun goes in `glossary.md` with a
  one-line justification.
- If a mechanic's only justification is "because Half-Life did it", it needs a new justification
  or it gets cut.

## Note on the "Overwatch" name

The expansion is titled **OVERSEER**, not Overwatch (the in-fiction AI is "the Eye" / "Oversight").
This avoids confusion with both the Half-Life AI and the Blizzard franchise.
