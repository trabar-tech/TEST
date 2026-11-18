#!/usr/bin/env node
/**
 * Architectural boundary checks (ADR-0001).
 *
 *  1. `Math.random` may only appear in src/core/rng.ts
 *  2. src/core/** must not import pixi.js, touch `window`/`document`, or use DOM APIs
 *  3. src/core/** must not import from src/render or src/ui
 *  4. content JSON must not contain a "truth" key inside a claim (Paper Truth guard)
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
