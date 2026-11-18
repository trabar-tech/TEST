---
id: GLOSSARY
title: Glossary (canonical vocabulary)
status: approved
owner: narrative
depends_on: [PITCH-01]
consumed_by: [all docs, content/text]
updated: 2026-11-18
---

# Glossary

**Rule:** any proper noun used in a doc, a bark, or content JSON must appear here with a
one-line definition. Terms are either **In-world** (fiction) or **Mechanical** (systems).

## In-world

| Term | Definition |
|---|---|
| **Vess** | The city. Once a port-industrial capital; now administered, not governed. |
| **the Emergency** | The never-ended legal state that justifies the Directorate's rule. Year 9 at game start. Nine years is long enough that nobody remembers normal. |
| **the Directorate** | The civil authority. Faceless, procedural, endlessly fond of forms. Not aliens, not robots — *people*, which is worse. |
| **Oversight** | The Directorate's internal monitoring branch ("the Eye"). The equivalent of an AI-overwatch: distributed analysts plus an inference system. |
| **OVERSEER** | The expansion. The player's role as a promoted part of Oversight's dispatch layer. Also the working title of the campaign's promotion ending. |
| **Civil Protection** | The enforcement corps. Locally called **"the Orders"** (from the shoulder patch), never "cops". |
| **Warden** | A rank of Civil Protection officer. Fourth → Third → Second → First → **Inspector** → **Section Lead**. |
| **Sector 4 / Kiln Row** | The game's district: tenement row, canal market, laundry, tram depot, checkpoint gates, printery, annex. Fourteen blocks. |
| **Ration class** | A/B/C/D. A is the Directorate; D means surplus labour and half portions. Your family is C. |
| **Curfew pass** | The document that makes being outside legal. The single most-paperwork document in the game. |
| **The Ledger** | Slang for the city administrative record — and the title of the report system the player writes into. "It's in the Ledger" = it's officially true. |
| **Paper Truth** | The doctrine that the Ledger's contents outweigh observation. Mechanically: the sim reads claims, not facts (ADR-0002). |
| **Compliance Review** | An internal investigation of an officer's filings. A shift-long punitive modifier. |
| **Field Authorisation** | A radio-granted permission to use rung 4+ force. Logged, always. |
| **Field Note** | A one-line quick record made on the Beat that must be expanded at the Desk. |
| **The Cell** | The largest insurgent network in Sector 4. Not noble: it uses people. |
| **The Syndicate** | Smugglers controlling the canal route. Pragmatic, corrupt, useful. |
| **The Congregation** | A banned chapel that hides the sick. The closest thing to a moral centre in the sector. |
| **Kettle** | A cordon (crowd containment). Also a verb: "kettle the market". |
| **The Quiet Detail** | The Directorate's plainclothes observers. Rare, unmarked, never interactable. |
| **Continuing Service** | Post-campaign endless mode. The job doesn't end. |

## Mechanical

| Term | Definition |
|---|---|
| **The Beat** | The patrol phase of a shift. Slow, verbal, information-gathering. |
| **The Incident** | The tactical phase. Paused/ordered, spatial, dangerous. |
| **The Desk** | The Night Desk. Report filing. The game's thesis surface. |
| **Report Line** | One filed claim about one event. The atomic unit of the game. |
| **Slack** | Divergence between a claim and the truth. 0 = honest, 1 = brazen. |
| **Stability** | How well a line holds up. Decays; drops on contradiction; below 0.4 it shows a **crack**. |
| **Lifespan** | Shifts a line remains checkable. Then it "dries" into the permanent City Record. |
| **Crack** | The visual marker of an unstable line in the Case File. |
| **Exposure gutter** | The live risk readout shown while filing. Never punishes unforeseeable lies. |
| **SectorBelief** | The sim's model of *what the city thinks happened*, computed from claims. |
| **Temperature** | 0–100 sector unrest scalar. Drives incidents, colour grade, ambience. |
| **Force ratchet / `force_index`** | Persistent escalation. Suppression breeds resistance; de-escalation is slow and costly. |
| **Force continuum (rungs 1–5)** | Presence → Control → Compliance → Lethal → Collective. |
| **Focus** | Solo slow-mo (0.35×, 6 s budget). Only when no squad is attached. |
| **Flow** | Bonus for issuing 3+ orders in 5 s while unpaused. Rewards real-time commanding. |
| **Stack / Breach / Clear** | The tactical order trio. "Clear" is a *claim*, not a fact. |
| **Fault line** | The player's behavioural vector (brutality, leniency, honesty, corruption…). The Desk targets it. |
| **Arbiter** | The neutral pacing budget between the three directors. |
| **the Desk / the Cell / the Eye** | The three directors: pressure, insurgency, surveillance. |
| **Case File** | The player's browsable archive of every filed line. Also the OVERSEER import payload. |
| **Standing / Legitimacy / Integrity** | The three reputation tracks: career, street, self. |
| **Requisition (RP) / Ration (FP) / Intel (IT)** | Spendable currencies. |
| **Micromanagement flag** | OVERSEER's penalty for taking manual control of a dispatched squad. |

## Banned words (tone guard)

Avoid in-world text: *"evil"*, *"hero"*, *"tyrant"*, *"freedom fighters"*, *"the bad guys"*,
*"oppression"* (as exposition). The regime never calls itself oppressive; the resistance never
calls itself good. Let the nouns do the work: *quota*, *notice*, *screening*, *surplus*, *pass*.
