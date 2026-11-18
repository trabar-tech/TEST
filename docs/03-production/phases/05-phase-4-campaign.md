---
id: PH-4
title: "Phase 4 — Economy, family, campaign & endings (6–8 sessions) — GATE G3"
status: review
owner: design
depends_on: [PH-3, SYS-ECON-01]
consumed_by: [PH-5]
updated: 2026-11-18
---

# Phase 4 — Economy, family, campaign, endings

**Phase thesis:** *the job should cost rent.*

This phase turns a good systemic loop into a **campaign** — which mostly means **tuning**, and
tuning is where projects lie to themselves. So the rules here are stricter than elsewhere: every
number is a JSON value, every curve is tested against a stated intent, and no tuning session ends
without a recorded decision.

---

## 1. Scope

**In:** rank/quota/perk/requisition systems; the nightly household ledger and debt tree; the
family layer and reactive family scenes; 15-shift act structure with transitions; 5 endings keyed
on data; the Case File browser (searchable); Compliance Review / purge rules; Act III politics
(the denounce mechanic).

**Out:** Continuing Service (Phase 5), the OVERSEER bridge (Phase 6), VO, hub art.

---

## 2. Entry criteria

- [ ] **G2 passed**
- [ ] All tuning parameters exposed in JSON with a single `tuning.json` for the campaign curve
- [ ] A headless campaign runner exists (simulate 15 shifts without rendering) — *this is the
      single most valuable tool of the phase; build it first if it doesn't*

## 3. Exit criteria

- [ ] 15 shifts playable start to finish, no dead ends, no unreachable endings
- [ ] All 5 endings reachable and determined by data (verified by the headless runner, not by eyeball)
- [ ] A player who never lies can afford rent in Act I and *barely* in Act II (~30% failure rate)
- [ ] Negative ration points are recoverable within 2 shifts via ≥1 path
- [ ] Promotion always adds a verb, never just a number
- [ ] The nightly ledger resolves in < 20 s for a decisive player

---

## 4. Task cards

### P4-T01 · Rank, quota, perks, requisition
- **Why:** power must be purchased with visibility (`SYS-ECON-01` §1). Rank changes the *shape* of
  the job.
- **What:** 5 ranks with quotas, RP and wages from the table; 8 perks with audit costs; the
  requisition catalogue with audit weights; promotion/demotion rules.
- **Acceptance:** promotion at shift 6 adds a verb (squad comms / home entry) that is *required*
  within two shifts; no gear item dominates for every scenario (design review checklist); RP
  resets are felt as a decision, not a tax.
- **Not included:** specialist squad members beyond one.
- **Cut candidate:** perks to 5.

### P4-T02 · Household ledger + debt tree
- **Why:** the pressure valve. Career progression is abstract; rent is not.
- **What:** 4 line items max; wage minus deductions; debt to −60; the four-branch borrow tree, each
  branch a content thread (bribe, sell gear, Syndicate loan, let rent slip).
- **Acceptance:** a player who never lies and never borrows fails rent ~30% of the time in Act II;
  each borrow branch produces distinct content, not a stat change; the ledger is 4 lines, never 5.
- **Not included:** property, upgrades to the flat.
- **Cut candidate:** the rotating "need" line (down to 3 items).

### P4-T03 · Family layer + reactive scenes
- **Why:** complicity has a face (`GDD` §3.9).
- **What:** spouse and child with states (health, trust, fear); family scenes as storylets whose
  prerequisites read *today's* events; a nightly domestic beat of ≤60 s.
- **Acceptance:** every family scene references today's events (validator: no generic scenes);
  a tester describes the family as *a reason*, not a chore; skipping family scenes has a cost the
  player notices.
- **Not included:** a family subplot with its own branching arc (keep it reactive).
- **Cut candidate:** the child's school content.

### P4-T04 · Campaign structure, 3 acts, transitions
- **Why:** 15 shifts need a shape, and the acts are the pacing statement (`GDD` §2.3).
- **What:** act gates (shift 5/10), escalated directives, Act III's record-as-weapon mechanic, the
  between-act summary ("what the Directorate has become").
- **Acceptance:** the headless runner completes 15 shifts; act transitions change at least three
  visible things (directives, deck weights, barks); no act has a dead shift (nothing to do but
  quota).
- **Not included:** mid-act branching.
- **Cut candidate:** 10 shifts (cut #5) — pre-committed if G3 fails.

### P4-T05 · Five endings + Case File browser
- **Why:** the endings are the payoff of the Record being data; the Case File is the game's memory
  and the OVERSEER import.
- **What:** ending resolution from (Standing, Legitimacy, Integrity, dominant classification);
  the Case File browser with search by tag/citizen/shift; cracks rendered; export as JSON.
- **Acceptance:** the headless runner reaches all 5 endings from scripted play patterns; every
  ending is explainable from the Case File ("here is the line that did it"); search returns in
  < 100 ms on a 400-line archive.
- **Not included:** animated ending cinematics (static, text-forward).
- **Cut candidate:** the search UI (filter by tag only).

### P4-T06 · Compliance Review, purge, hard fails
- **Why:** failure must be legible and interesting (`GDD` §3.7). Fail forward; die rarely.
- **What:** the review modifier (harsher audits, no requisition); 3-in-a-row = purge ending; death
  rules tied to escalation; the "your reports found you first" sequence.
- **Acceptance:** a purge is always preceded by two visible warnings; death from your own
  escalation is explainable from the log; no run ends without a stated cause.
- **Not included:** resurrection, retries mid-shift.
- **Cut candidate:** death entirely (purge is the only hard fail) — arguably better design.

### P4-T07 · Act III politics (denounce)
- **Why:** the record as a weapon against colleagues — the last verb the game gives you, and the
  bridge to OVERSEER's politics.
- **What:** denounce a rival warden using your archive; consequences via Standing, attention and
  the audit; blowback if your lines contradict.
- **Acceptance:** denouncing with a stable, corroborated line succeeds; with an unstable one it
  backfires and the backfire is foreseeable from the exposure gutter.
- **Not included:** a full factional politics sim inside Civil Protection.
- **Cut candidate:** the entire task (content, not system).

---

## 5. Session plan (6–8)

| Session | Do | End state |
|---|---|---|
| A | headless campaign runner | 15 shifts in 4 seconds, no rendering |
| B | T01 + T02 | a job with a wage and a landlord |
| C | T03 | a family that notices |
| D | T04 | three acts with a shape |
| E | T05 + T06 | endings and consequences |
| F | T07 | the last verb |
| G–H (buffer) | tuning passes + G3 build | playlist |

**Tuning protocol (the important bit):** each tuning session picks **one** stated intent
(e.g. "Act II rent should fail 30% of the time for an honest player"), changes only `tuning.json`,
runs the headless runner over 50 seeds, records the distribution, and writes the decision + the new
numbers into `04-progression-economy.md`. Never tune two intents at once, never tune by feel.

## 6. GATE G3 — *"Would I finish this twice?"*

Playlist: the full campaign, from a menu, over as many sessions as the tester wants (ideally 2–3
sittings). This is the only gate that needs a **long** test.

**Pass questions:**
1. **Completion:** did the tester reach shift 15? **PASS:** 2 of 3 complete or *deliberately*
   restart after Act II (restarting counts — it means the systems are inviting).
2. **Rerun intent:** would they start again with a different approach? **PASS:** 2 of 3 say yes
   *and name what they'd do differently*.
3. **Story:** can they retell the campaign in 60 seconds as a story about a person? **PASS:** 2 of 3.

### If G3 fails
1. **Abandonment in Act II (most likely):** Act II is the pressure peak; if players quit there, the
   quota curve is too steep. Flatten it (the headless runner makes this a 20-minute change).
2. **No rerun intent:** the endings aren't different enough, or the Record doesn't diverge. Add 2
   ending variants and one Act III scene keyed to the dominant tag.
3. **Still failing:** cut to 10 shifts (cut #5) and ship. A tight 10-hour game that finishes is
   strictly better than a 15-hour one that doesn't.

## 7. Cut line

Denounce → death rules (purge only) → rotating ledger line → 15→10 shifts → Case File search.
**Never cut:** the rent, the borrow tree, the five endings' data-driven resolution, the Case File.

## 8. Gate result (fill in)

*Date · testers · completion rate · rerun intent · retellings · decision · tuning changes · docs.*
