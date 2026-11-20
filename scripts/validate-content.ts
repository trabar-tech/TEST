#!/usr/bin/env tsx
/**
 * `npm run validate` — authoring CLI (P0-T07).
 *
 * Validates every content file and prints the diagnostics that matter while
 * writing: connective-tissue ratio, duplicate ids, unresolved references, and
 * directive contradiction cycles. Exits non-zero on any error so it can be a
 * pre-commit hook.
 *
 * Deliberately the same code path as boot: if this passes, the game boots.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  AuthoredCastSchema,
  BarksSchema,
  IncidentAnchorsSchema,
  ContentError,
  ContentVersion,
  formatIssues,
  type LoadedContent,
} from '@core/content';
import { mapJsonToDef, loadBundle, type MapJson } from './lib/load-content';
import { DIRECTIVE_TAGS } from '../src/systems/directive-conflicts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** interior map ids seen, and the interiors an anchor promised: checked at the end */
const interiorIds = new Set<string>();
const interiors: string[] = [];

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries.sort()) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (entry.endsWith(ext)) out.push(p);
  }
  return out;
}

let errors = 0;
let warnings = 0;

function fail(msg: string): void {
  errors += 1;
  console.error(`  ✗ ${msg}`);
}

function warn(msg: string): void {
  warnings += 1;
  console.warn(`  ! ${msg}`);
}

/* ------------------------------------------------------------------ content */

console.log('content');

/**
 * `tuning.json` lives under `content/` so it ships with the bundle, but it is *configuration*,
 * not authored content: it has no storylets, so a connective-tissue ratio is meaningless and
 * checking it produced "0.00 is below the 0.40 budget" — a warning that trains people to
 * ignore warnings. It is validated by `src/core/tuning.ts` (`checkTuning`) and by
 * `tests/tuning.test.ts` instead, with messages that name the field.
 */
const NOT_CONTENT = new Set(['tuning.json']);

const contentFiles = walk(join(ROOT, 'content'), '.json').filter(
  (f) => !NOT_CONTENT.has(relative(join(ROOT, 'content'), f)),
);
if (contentFiles.length === 0) fail('no content files found');

const loaded: LoadedContent[] = [];
for (const file of contentFiles) {
  const rel = relative(ROOT, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${rel} — not valid JSON (${(e as Error).message})`);
    continue;
  }
  const shape = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // bark sets: tone content, validated for shape
  if ('loudspeaker' in shape) {
    const parsed = BarksSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of formatIssues(parsed.error.issues)) fail(`${rel} — ${issue.path}: ${issue.message}`);
    } else {
      const lines =
        parsed.data.loudspeaker.length + parsed.data.radio.length + parsed.data.ambient.length + parsed.data.witness.length;
      console.log(`  · ${rel} — ${lines} lines of voice`);
    }
    continue;
  }

  // an authored cast: citizens + routines
  if ('routines' in shape) {
    const parsed = AuthoredCastSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of formatIssues(parsed.error.issues)) fail(`${rel} — ${issue.path}: ${issue.message}`);
    } else {
      const ids = new Set<string>();
      for (const c of parsed.data.citizens) {
        if (ids.has(c.id)) fail(`${rel} — duplicate citizen id ${c.id}`);
        ids.add(c.id);
        if (!(c.post in parsed.data.routines)) {
          fail(`${rel} — ${c.id} stands at post "${c.post}" but has no routine for it`);
        }
      }
      console.log(`  · ${rel} — ${parsed.data.citizens.length} citizens, ${Object.keys(parsed.data.routines).length} routines`);
    }
    continue;
  }

  // incident anchors: the bridge from street to tactical scene (P2)
  if ('anchors' in shape) {
    const parsed = IncidentAnchorsSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        fail(`${rel} — ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    } else {
      const ids = new Set<string>();
      for (const a of parsed.data.anchors) {
        if (ids.has(a.id)) fail(`${rel} — duplicate anchor id ${a.id}`);
        ids.add(a.id);
        if (a.interior) interiors.push(a.interior);
      }
      console.log(`  · ${rel} — ${parsed.data.anchors.length} anchors`);
    }
    continue;
  }

  // a map file has `rows`, a content bundle does not
  if ('rows' in shape) {
    if (typeof shape.id === 'string' && 'rooms' in shape && 'hostiles' in shape) {
      interiorIds.add(shape.id);
    }
    try {
      mapJsonToDef(raw as MapJson);
      console.log(`  · ${rel} — map ok`);
    } catch (e) {
      fail(`${rel} — ${(e as Error).message}`);
    }
    continue;
  }
  try {
    const bundle = loadBundle(raw, rel, ContentVersion);
    loaded.push(bundle);
    const { report } = bundle;
    console.log(
      `  · ${rel} — ${bundle.bundle.micro_events.length} storylets, ` +
        `${bundle.bundle.citizens.length} citizens, ${bundle.bundle.directives.length} directives`,
    );
    for (const dup of report.duplicateIds) fail(`${rel} — duplicate id ${dup}`);
    for (const ref of report.unresolvedReferences) fail(`${rel} — unresolved reference ${ref}`);
    for (const cyc of report.contradictionCycles) {
      // no longer a warning: `directive-conflicts.ts` charges for it on the audit
      // sheet, and the desk warns before signing. A cycle is intended content.
      console.log(`  · ${rel} — contradiction pair ${cyc} (enforced by the audit)`);
    }
    // an order with no acts can never be scored, which makes it prose pretending to
    // be a rule — worth saying out loud during authoring
    for (const d of bundle.bundle.directives) {
      if (d.tags.length === 0 && !DIRECTIVE_TAGS[d.id]) {
        warn(`${rel} — directive ${d.id} has no tags and is not in DIRECTIVE_TAGS, so it can never be satisfied or broken`);
      }
    }
    if (report.connectiveTissueRatio < 0.4) {
      warn(
        `${rel} — connective-tissue ratio ${report.connectiveTissueRatio.toFixed(2)} ` +
          `is below the 0.40 budget (PROD-METHOD §5)`,
      );
    } else {
      console.log(`    connective tissue: ${report.connectiveTissueRatio.toFixed(2)}`);
    }
  } catch (e) {
    if (e instanceof ContentError) fail(e.message);
    else fail(`${rel} — ${(e as Error).message}`);
  }
}

/* ------------------------------------------------------- cross-file checks */

for (const wanted of interiors) {
  if (!interiorIds.has(wanted)) fail(`an incident anchor points at interior "${wanted}", which no map file declares`);
}

/* -------------------------------------------------------------------- summary */

console.log('');
if (errors > 0) {
  console.error(`✗ ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
}
console.log(`✓ content valid (${loaded.length} bundle(s), ${warnings} warning(s))`);
