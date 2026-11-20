#!/usr/bin/env tsx
/**
 * Sweep a tuning dial and report the curve.
 *
 *   npm run sweep -- economy.rent 30,45,60
 *   npm run sweep -- district.turn_shifts 1,2,3 --seeds 8
 *
 * This is the tool `tuning.json` was built for. The point of exposing a number is not that it
 * is in a file — it is that changing it produces a *before/after* instead of an opinion.
 *
 * Deliberately narrow: one dial at a time, several values, a fixed seed set. A two-dimensional
 * sweep is how tuning sessions turn into lore.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapJsonToDef, loadBundle, type MapJson } from './lib/load-content';
import { TileMap } from '@core/nav';
import { ContentVersion } from '@core/content';
import { TUNING, resetTuning, tune, type TuningPatch } from '@core/tuning';
import { POLICIES, runCampaign } from '@systems/campaign';
import { generateSector } from '@systems/households';
import type { MapJsonSlice } from '@systems/shift';

const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const args = process.argv.slice(2);
const dial = args[0];
const values = (args[1] ?? '').split(',').filter(Boolean);
const seedsAt = args.indexOf('--seeds');
const seeds = seedsAt >= 0 ? Number(args[seedsAt + 1] ?? '4') : 4;

if (!dial || values.length === 0) {
  console.error('usage: npm run sweep -- <block.dial> <v1,v2,...> [--seeds N]');
  console.error('e.g.   npm run sweep -- economy.rent 30,45,60');
  process.exit(1);
}

const [block, key] = dial.split('.');
if (!block || !key) {
  console.error(`-- ${dial} is not block.dial`);
  process.exit(1);
}

const bundle = loadBundle(read('content/examples/content.sample.json'), 'content.sample.json', ContentVersion);
const mapJson = read('content/maps/kiln_row_slice.json') as MapJson;
const citizens = read('content/examples/citizens.slice.json');
const map = new TileMap(mapJsonToDef(mapJson));

/** Read the dial's current shipped value, so the header can say what is being moved. */
const baseline = (TUNING as unknown as Record<string, Record<string, unknown>>)[block]?.[key];
if (baseline === undefined) {
  console.error(`-- ${dial} is not a tuned number in content/tuning.json`);
  process.exit(1);
}

console.log(`sweeping ${dial} (shipped: ${String(baseline)}) · ${seeds} seeds × ${Object.keys(POLICIES).length} policies\n`);
console.log(['value', 'avg temp', 'end temp', 'findings', 'auto', 'removed'].join('\t'));

for (const raw of values) {
  const value = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
  if (typeof value === 'number' && Number.isNaN(value)) {
    console.error(`-- ${raw} is neither a number nor a boolean`);
    process.exit(1);
  }
  // applied to the live document, so the systems genuinely read the swept value. The first
  // version of this file built a patched document and passed it nowhere: three values, one
  // identical row. That is why `tune()` exists.
  const tuning = tune({ [block]: { [key]: value } } as TuningPatch);
  if ((tuning as unknown as Record<string, Record<string, unknown>>)[block]?.[key] !== value) {
    console.error(`-- ${dial} did not take effect; the sweep would report fiction`);
    process.exit(1);
  }

  let tempTotal = 0;
  let endTemp = 0;
  let findings = 0;
  let auto = 0;
  let removed = 0;
  let runs = 0;

  for (const policy of Object.values(POLICIES)) {
    for (let seed = 1; seed <= seeds; seed++) {
      const sector = generateSector({ seed: 900 + seed });
      const result = runCampaign({
        seed,
        policy,
        shifts: 15,
        map,
        mapJson: mapJson as unknown as MapJsonSlice,
        citizens,
        sector,
        cards: bundle.bundle.micro_events,
        directives: bundle.bundle.directives,
      });
      runs++;
      const temps = result.shifts.map((s) => s.temperature);
      tempTotal += temps.reduce((a, b) => a + b, 0);
      endTemp += temps.at(-1) ?? 0;
      findings += result.shifts.reduce((a, s) => a + s.findings, 0);
      auto += result.shifts.reduce((a, s) => a + s.autoFiled, 0);
      if (result.ending === 'removed from post') removed++;
    }
  }

  console.log(
    [
      String(value),
      (tempTotal / (runs * 15)).toFixed(1),
      (endTemp / runs).toFixed(1),
      findings,
      auto,
      `${removed}/${runs}`,
    ].join('\t'),
  );
}

resetTuning();
console.log(
  '\nReading a flat row: it means the dial does not reach the reported numbers, which is a\n' +
    'finding about the model, not a failure of the sweep. Two known cases:\n' +
    '  · economy.* — the campaign runner does not consume the ledger yet (05-phase-4-entry §4)\n' +
    '  · district.turn_shifts — grievance is absorbing (a household that turns available never\n' +
    '    leaves), so the *number* of angry nights does not change a 15-shift outcome. The dial\n' +
    '    only shifts timing, and only turn_shifts=1 differs at all.',
);
