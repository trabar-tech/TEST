#!/usr/bin/env tsx
/**
 * Run the headless campaign and print what happened.
 *
 *   npm run campaign                    # 4 policies × 5 seeds, 15 shifts
 *   npm run campaign -- --seeds 20      # a distribution worth quoting
 *   npm run campaign -- --policy honest --verbose
 *
 * The point is not the report — it is that a tuning change has a *before* and an *after*.
 * Phase 4's exit criteria are all claims about distributions ("~30% failure rate"),
 * and a distribution needs a tool, not an eyeball.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapJsonToDef, loadBundle, type MapJson } from './lib/load-content';
import { TileMap } from '@core/nav';
import { ContentVersion } from '@core/content';
import { POLICIES, runCampaign, summariseCampaign, type PolicyName } from '@systems/campaign';
import { generateSector } from '@systems/households';
import type { MapJsonSlice } from '@systems/shift';

const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : fallback;
};
const seeds = Number(flag('seeds', '5'));
const only = flag('policy') as PolicyName | undefined;
const verbose = args.includes('--verbose');

const bundle = loadBundle(read('content/examples/content.sample.json'), 'content.sample.json', ContentVersion);
const mapJson = read('content/maps/kiln_row_slice.json') as MapJson;
const citizens = read('content/examples/citizens.slice.json');
const map = new TileMap(mapJsonToDef(mapJson));

const policies = only ? [POLICIES[only]] : Object.values(POLICIES);
const lines: string[] = [];
let removed = 0;
let total = 0;

for (const policy of policies) {
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
    total++;
    if (result.ending === 'removed from post') removed++;
    lines.push(summariseCampaign(result));
    if (verbose) {
      for (const s of result.shifts) {
        lines.push(
          `   shift ${String(s.shift).padStart(2)} · temp ${String(s.temperature).padStart(3)} · ` +
            `grief ${s.grief} · scenes ${s.scenes} · known ${s.known} · avail ${s.available} · ` +
            `findings ${s.findings} · auto ${s.autoFiled}${s.dueEpilogues.length ? ` · epilogue ${s.dueEpilogues.join(',')}` : ''}`,
        );
      }
    }
  }
}

console.log(lines.join('\n'));
console.log(
  `\n${total} runs · ${removed} ended removed from post (${Math.round((removed / total) * 100)}%)`,
);
console.log('note: incidents are resolved through the docket path, not the tactical scene.');
