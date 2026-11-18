---
id: TPL-SYS
title: <System Name>
status: draft
owner: design
depends_on: []
consumed_by: []
updated: YYYY-MM-DD
---

# <ID> · <System Name>

**Problem it solves:** one paragraph. What breaks if this system doesn't exist?

## 1. Player experience
What the player presses, sees, and feels. Written without implementation words.

## 2. Data model
```ts
interface Thing { /* the shape, with units and ranges */ }
```

## 3. Rules (deterministic)
Numbered rules. Each rule must be testable in isolation.

## 4. Numbers
| Parameter | Value | Owner task |
|---|---|---|
| | | |

Any unproven number is marked `HYPOTHESIS:` with the gate that will settle it.

## 5. UI / feedback
How the player perceives state. If the player cannot perceive it, it must not affect them
(invariant `SYS-INDEX` #2).

## 6. Failure modes this design must avoid
| Failure | Guard |
|---|---|

## 7. Acceptance checks
1. …
2. …

## 8. Open questions
- Q1: … (options: a / b / c)
