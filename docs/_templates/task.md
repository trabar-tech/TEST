---
id: TPL-TASK
title: <P#-T##> <short imperative title>
phase: <n>
state: todo          # todo | in-progress | playable | verified | cut
owner: <design|tech|narrative|production>
depends_on: []
unknown: <the single thing this task resolves>
---

# P#-T## · <title>

## Why
One or two lines linking to the design doc section this serves.

## What
Bullet list of the smallest change that makes the acceptance check runnable.
Do not gold-plate. Explicitly list what is *not* included.

## Unknown / decision needed
If this task needs a design decision, write the ADR *before* the code and link it here.

## Acceptance check (a stranger can run this)
- [ ] step 1 (in the browser, no code reading)
- [ ] step 2
- [ ] step 3

## Done means
- [ ] acceptance check passes
- [ ] docs reconciled (`updated:` field, status board, glossary)
- [ ] any cut scope recorded in `03-production/01-roadmap.md` Cut List

## Cut candidate
If this slips, what do we drop instead? (be specific)
