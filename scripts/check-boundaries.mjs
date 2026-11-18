#!/usr/bin/env node
/**
 * Architectural boundary checks (ADR-0001).
 *
 *  1. `Math.random` may only appear in src/core/rng.ts
 *  2. src/core/** must not import pixi.js, touch `window`/`document`, or use DOM APIs
 *  3. src/core/** must not import from src/render or src/ui
 *  4. content JSON must not contain a "truth" key inside a claim (Paper Truth guard)
 *  5. no system may derive world state from `truth`: the sim reads `claim` only
 *     (SYS-REC-01 §5.3). The audit and the tests are the only exceptions.
 *
 * Exits non-zero with a readable list. Cheap enough to run in CI and by hand.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(p);
  }
  return out;
}

const problems = [];
const files = walk(SRC);

const RANDOM_ALLOWED = join('core', 'rng.ts');

for (const file of files) {
  const rel = relative(SRC, file);
  const code = readFileSync(file, 'utf8');
  const lines = code.split('\n');

  // 1. Math.random
  if (!rel.endsWith(RANDOM_ALLOWED)) {
    lines.forEach((line, i) => {
      if (/Math\.random\s*\(/.test(line) && !/check-boundaries|eslint-disable/.test(line)) {
        problems.push(`${rel}:${i + 1} uses Math.random outside core/rng.ts`);
      }
    });
  }

  // 2. DOM + pixi in core
  if (rel.startsWith('core/') || rel.startsWith('core\\')) {
    lines.forEach((line, i) => {
      if (/from\s+['"]pixi\.js['"]/.test(line)) {
        problems.push(`${rel}:${i + 1} imports pixi.js — core must stay headless (ADR-0001)`);
      }
      if (/\b(window|document|localStorage|indexedDB|navigator)\s*\./.test(line)) {
        // a type-only mention or a guarded typeof check is fine
        if (/typeof\s+(window|document|localStorage|indexedDB|navigator)/.test(line)) return;
        if (/^\s*(\*|\/\/)/.test(line)) return;
        problems.push(`${rel}:${i + 1} touches the DOM — core must stay headless (ADR-0001)`);
      }
    });
  }

  // 3. core must not depend on render/ui
  if (rel.startsWith('core/') || rel.startsWith('core\\')) {
    lines.forEach((line, i) => {
      if (/from\s+['"](@render|@ui|\.\.\/render|\.\.\/ui)/.test(line)) {
        problems.push(`${rel}:${i + 1} imports render/ui — dependency direction is one-way`);
      }
    });
  }
}

// 5. the sim must never read `truth` (Paper Truth, enforced)
//
// The whole design rests on "the city believes what it is told". A single
// `line.truth.classification` reached from a system would silently turn the game
// into one where the regime knows everything, and no test would catch it.
const TRUTH_READERS = new Set(['core/record.ts', 'systems/audit.ts']);
for (const file of files) {
  const rel = relative(SRC, file);
  if (TRUTH_READERS.has(rel)) continue;
  if (!rel.startsWith('systems/')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // `truth` as a value read off a line/claim, not a parameter name or a type
    if (/\bline\.truth\b|\b\.truth\.(classification|force_rung|detainees|damage|casualties|bribe_taken|third_party_present|illegal_search)/.test(line)) {
      problems.push(`${rel}:${i + 1} reads \`truth\` — simulation must derive from claims only (SYS-REC-01 §5.3)`);
    }
  });
}

// 4. Paper Truth guard on content: no `truth` inside authored claims
import { globSync } from 'node:fs';
void globSync;

const CONTENT = join(ROOT, 'content');
function checkContentJson(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) checkContentJson(p);
    else if (entry.endsWith('.json')) {
      const text = readFileSync(p, 'utf8');
      if (/"claim"\s*:\s*\{[^}]*"truth"/s.test(text)) {
        problems.push(`${relative(ROOT, p)} — authored claims must not contain "truth"`);
      }
    }
  }
}
checkContentJson(CONTENT);

if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} boundary violation(s):\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('');
  process.exit(1);
}

console.log(`✓ boundaries clean (${files.length} source files, content checked)`);
