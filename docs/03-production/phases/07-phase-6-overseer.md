---
id: PH-6
title: "Phase 6 — OVERSEER expansion (1 prototype + 10–14 sessions) — GATE G4"
status: review
owner: design
depends_on: [PH-5, SYS-OVS-01, SYS-STORY-01]
consumed_by: [post-1.0]
updated: 2026-11-18
---

# Phase 6 — OVERSEER

**Phase thesis:** *the regime's sin isn't surveillance; it's that surveillance can't see meaning.*

**The gate comes first.** G4 is a 20-minute frozen prototype with no art, run **before** any
expansion production. If attention scarcity isn't tense there, the expansion is cut and the time
goes into Continuing Service.

---

## 1. Scope

**In:** headless tactical resolution; the city map layer; camera tasking with a 3-feed attention
cap; anomaly triage with source credibility; squad dispatch; audits as a two-edged tool; macro
levers (curfew, ration cut, sweep, amnesty); Case File import as ground truth; manual-control
bridge with the micromanagement flag; Act III self-inquiry in the Desk UI; 4 endings.

**Out:** city-building, 4X layers, multiplayer, modding API, voice acting, a second tactical mode.

---

## 2. Entry criteria

- [ ] Base game shipped and **frozen** (4-week bugfix window passed)
- [ ] The five architectural rules hold and are *tested* (`SYS-OVS-01` §7):
      Record queryable · tactical headless · deterministic clocks · declarative content ·
      persistent named NPCs
- [ ] A base-game save with ~200+ filed lines exists to import (test with a real archive, not a
      fixture)

## 3. The pre-work: G4 prototype (1 session, before anything else)

### P6-T01 · Frozen watch-cycle prototype
- **What:** one sector, 3 feeds, 2 squads, 4 anomaly pins, no art, 20 minutes of play. Nothing
  else. Text and rectangles.
- **Acceptance:** a tester finishes one watch cycle and can say *which block they weren't watching*
  and *what it cost*. That sentence is the whole expansion.
- **Cut candidate:** the expansion itself.

## 4. GATE G4 — *"Is attention scarcity tense?"*

**Pass questions:**
1. Did the tester feel the cost of *not watching* something? **PASS:** 2 of 3 name a specific
   neglect unprompted.
2. Did they have a genuine dilemma about *whose report to believe*? **PASS:** 2 of 3.
3. Would they play a second cycle? **PASS:** 2 of 3.

### If G4 fails
Cut the expansion (cut #6). Spend 3–4 sessions on Continuing Service + NG+ instead, which are
cheap, shipped-adjacent and satisfying. Record the decision with the test notes — do not leave the
idea half-built in the tree.

## 5. Task cards (post-G4)

### P6-T02 · Headless tactical resolution
- **What:** resolve a dispatched scene without rendering, in < 2 s, deterministically; produce the
  same `ReportLine` shape the player's own filing produces.
- **Acceptance:** a dispatched squad resolves and files a line with `authority: 'squad'`; the same
  seed produces the same outcome; no renderer is initialised (assert in test).
- **Not included:** a visual fast-forward.

### P6-T03 · City map + camera tasking + 3-feed cap
- **What:** 6 sectors × 5 blocks; camera nodes with coverage and reliability; 3 simultaneous live
  feeds, everything else recorded for later; threat pins.
- **Acceptance:** neglect is **attributable** — the after-action report names the block you
  weren't watching; the 3-feed cap is enforced and *painful* (testers rotate feeds constantly).
- **Cut candidate:** 6 sectors → 3.

### P6-T04 · Anomaly triage with source credibility
- **What:** pins with source (camera/warden/informant/citizen call) and a credibility score derived
  from that source's history — including the player's own base-game reliability.
- **Acceptance:** a warden who lied often in the imported archive is measurably less credible; the
  player can *see* the credibility and still be wrong.
- **Cut candidate:** citizen-call source.

### P6-T05 · Audits as a two-edged tool
- **What:** order an audit of a warden — finds lies, raises compliance, but degrades that warden's
  future report quality; the feedback loop is visible.
- **Acceptance:** after two audits, that squad's reports are measurably less useful within 3
  cycles; the trade is legible in the UI, not hidden in a formula.

### P6-T06 · Macro levers with reversible ratchets
- **What:** curfew, ration cut, sweep, media message, amnesty; each moves temperature and
  Legitimacy sector-wide; amnesty walks a ratchet back over 2 cycles.
- **Acceptance:** the only non-bloodbath ending is reachable *because* amnesty was used; the
  ratchet reversal is measurable and slow.
- **Cut candidate:** media message.

### P6-T07 · Case File import as ground truth
- **What:** the base-game archive loaded as the belief layer: your old lies are now defended by
  you, your protected family exists, your silenced witness is a missing-person file, your squad
  quote your own reports.
- **Acceptance:** at least three Act II obligations are generated *directly* from imported lines;
  a tester says "that's mine" unprompted.
- **This is the payoff task.** If it feels weak, the expansion's premise is weak.

### P6-T08 · Manual-control bridge + micromanagement flag
- **What:** take over a dispatched squad (drops into the base tactical layer); +1 flag per use;
  at 3, a Standing penalty and a directive questioning your delegation.
- **Acceptance:** manual control is never strictly optimal across 3 uses (measure); the flag bites
  within 3 uses.

### P6-T09 · Act III self-inquiry + 4 endings
- **What:** the inquiry **in the base game's Desk UI** — you file a report about yourself, with the
  same stamps, gutter and cracks. Four endings: Confirmed · Replaced · Redacted · Recursive.
- **Acceptance:** all 4 reachable purely from accumulated data (headless runner); the player's own
  imported lines appear as evidence in the inquiry.

---

## 6. Session plan (10–14 after G4)

| Session | Do |
|---|---|
| 0 | G4 prototype + gate |
| A–B | T02 + T03 |
| C | T04 + T05 |
| D | T06 |
| E | T07 |
| F | T08 |
| G–H | T09 + content |
| I–N | tuning, endings, polish |

## 7. Cut line

6 sectors → 3 → citizen calls → media message → audits → manual control (keep it as an unlock
instead of a mechanic). **Never cut:** the 3-feed cap, source credibility from the imported
archive, the self-inquiry in the Desk UI.

## 8. Gate result (fill in)

*Date · testers · three pass questions · the "what I wasn't watching" quotes · GO/NO-GO · docs.*
