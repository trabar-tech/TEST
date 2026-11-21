---
id: PT-04
title: "Playtest 2 — Break-in Sim Sandbox"
status: review
owner: design
depends_on: [PT-03, PH-2]
updated: 2026-11-18
---

# The ultimate trajectory: Break-in Sandbox

The user clarified the long-term vision of the game during the discussion of failure states.
While the current framework casts the player as a Warden, the structural goal is a
**"break in sim"** (simulation/sandbox).

> "a break in simulator, you dont belong there, there will be a simulated scenario, you can be a criminal or a swat officer or combine metrocop etc, undercover/stealth or go loud."

## What this means for current architecture

The game is currently built around a strictly ordered shift loop: Briefing -> Beat -> Raid -> Desk.
However, the user wants the City to eventually be a **Live District Map** where the player can survive to retirement, taking on different roles (SWAT, criminal, undercover).

1. **The Tactical Layer is the Core Sandbox.**
   The Incident (`src/systems/tactical/incident.ts`) must support being approached *not* as a cop with a badge. The verbs (breach, move, fire) are universal. What makes you a cop is the *Audit* afterwards. If you are a criminal, the Audit doesn't exist, but the Heat does.

2. **The Shift Loop is a Role, not the Engine.**
   Currently, `shift-cycle.ts` advances the whole campaign based on the Warden's docket. To support the "Break-in" model later, the simulation of the district (households, heat, factions) needs to run independently of the player's job.

3. **Medical Debt & Escalation.**
   The user noted that "debt and escalation" are optional difficulties/frameworks for this sandbox, and that heat should de-escalate with successful missions.

## Immediate Constraints

Do not rebuild the whole campaign loop into an open-world RPG right now. We are still finishing Step 4 (Enemy AI) of the *current* phase plan to make the tactical layer solid.

However, keep the architecture decoupled:
- **`Incident`** should not hard-assume you are a Warden (mostly achieved, it just tracks `unauthorisedForce`).
- **Enemy AI** needs to react to noise, sight, and aggression, not just "is the player a cop."
