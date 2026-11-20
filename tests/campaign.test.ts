/**
 * P4-T04 — the headless campaign runner.
 *
 * These tests are about the *tool*, not the balance. A runner that is non-deterministic
 * measures noise; a runner that does not actually file anything measures a game nobody
 * plays; a runner whose policies all produce the same report cannot falsify a claim. All
 * three of those were true of the first draft of this file's subject, and each is asserted
 * below so it cannot quietly become true again.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileMap } from '@core/nav';
import { mapJsonToDef, loadBundle, type MapJson } from '../scripts/lib/load-content';
import { generateSector } from '@systems/households';
import { POLICIES, runCampaign, summariseCampaign, type CampaignOptions } from '@systems/campaign';
import { collectActs, ordersForShift } from '@systems/shift-cycle';
import { ContentVersion } from '@core/content';
import type { MapJsonSlice } from '@systems/shift';

const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const bundle = loadBundle(read('content/examples/content.sample.json'), 'content.sample.json', ContentVersion);
const mapJson = read('content/maps/kiln_row_slice.json') as MapJson;
const citizens = read('content/examples/citizens.slice.json');

const base = (over: Partial<CampaignOptions> = {}): CampaignOptions => ({
  seed: 7,
  policy: POLICIES.honest,
  shifts: 6,
  map: new TileMap(mapJsonToDef(mapJson)),
  mapJson: mapJson as unknown as MapJsonSlice,
  citizens,
  sector: generateSector({ seed: 900 }),
  cards: bundle.bundle.micro_events,
  directives: bundle.bundle.directives,
  ...over,
});

describe('the campaign runner measures the game, not a script', () => {
  it('is deterministic for a seed + policy pair', () => {
    const a = runCampaign(base());
    const b = runCampaign(base());
    expect(a).toEqual(b);
  });

  it('produces a different run for a different seed', () => {
    const a = runCampaign(base({ seed: 7 }));
    const b = runCampaign(base({ seed: 8 }));
    expect(summariseCampaign(a)).not.toBe(summariseCampaign(b));
  });

  it('actually files what the policy claims — auto-filed count is zero for a filing policy', () => {
    const run = runCampaign(base({ policy: POLICIES.honest }));
    expect(run.shifts.every((s) => s.autoFiled === 0)).toBe(true);
    expect(run.shifts.some((s) => (s.claims.P ?? 0) > 0)).toBe(true);
  });

  it('the absent policy leaves the docket blank and the desk files for it', () => {
    const run = runCampaign(base({ policy: POLICIES.absent }));
    expect(run.shifts.reduce((a, s) => a + s.autoFiled, 0)).toBeGreaterThan(0);
  });

  it('policies diverge: a ruthless Warden and an honest one do not have the same run', () => {
    const honest = summariseCampaign(runCampaign(base({ policy: POLICIES.honest })));
    const ruthless = summariseCampaign(runCampaign(base({ policy: POLICIES.ruthless })));
    expect(honest).not.toBe(ruthless);
  });

  it('names citizens, so recurrence has somebody to work with', () => {
    const run = runCampaign(base());
    expect(run.shifts.at(-1)!.known).toBeGreaterThan(0);
  });

  it('plays scenes every shift, and more of them on the first', () => {
    const run = runCampaign(base());
    expect(run.shifts[0]!.scenes).toBe(2);
    expect(run.shifts.slice(1).every((s) => s.scenes === 1)).toBe(true);
  });

  it('reports its own limitation instead of hiding it', () => {
    const run = runCampaign(base());
    expect(run.notes.join(' ')).toMatch(/docket path, not the tactical scene/);
  });

  it('stops the campaign when three reviews land in a row', () => {
    const run = runCampaign(base({ shifts: 15 }));
    const last = run.shifts.at(-1)!;
    if (run.ending === 'removed from post') expect(last.reviewsInARow).toBe(3);
    else expect(last.reviewsInARow).toBeLessThan(3);
  });

  it('summarises a run in one line a tuning log can carry', () => {
    const line = summariseCampaign(runCampaign(base()));
    expect(line).toMatch(/honest seed 7: 6 shifts, temp \d+→\d+/);
  });
});

describe('the shift cycle is shared with the browser, so it lives in one place', () => {
  it('selects three orders plus the declared partner', () => {
    const directives = bundle.bundle.directives;
    const orders = ordersForShift(directives, 3);
    const paired = orders.filter((d) => d.contradicts.length > 0);
    for (const d of paired) {
      for (const id of d.contradicts) {
        expect(orders.some((o) => o.id === id), `${d.id} draws its partner ${id}`).toBe(true);
      }
    }
  });

  it('is stable for a shift number, so a replay asks for the same orders', () => {
    const a = ordersForShift(bundle.bundle.directives, 5).map((d) => d.id);
    const b = ordersForShift(bundle.bundle.directives, 5).map((d) => d.id);
    expect(a).toEqual(b);
  });

  it('returns nothing rather than throwing when a bundle has no directives', () => {
    expect(ordersForShift([], 1)).toEqual([]);
  });
});

describe('act collection lives in one place, so the ordering bug cannot return', () => {
  const docket = [
    { ref: 'a', edge: { household_id: 'h-001' } },
    { ref: 'b', edge: null },
    { ref: 'c', edge: { household_id: 'h-003' } },
  ];
  const line = (ref: string, cls: string) => ({
    event_ref: ref,
    claim: { classification: cls, force_rung: 2 },
  });

  it('takes hand-written and auto-filed lines alike', () => {
    const acts = collectActs(docket, [line('a', 'P')], [line('c', 'R')]);
    expect(acts.map((a) => a.household_id)).toEqual(['h-001', 'h-003']);
  });

  it('skips an event with no household rather than inventing one', () => {
    expect(collectActs(docket, [line('b', 'D')], []).map((a) => a.household_id)).toEqual([]);
  });

  it('never charges the same event twice, even if both line sets contain it', () => {
    const acts = collectActs(docket, [line('a', 'P')], [line('a', 'R')]);
    expect(acts).toHaveLength(1);
  });

  it('returns nothing for an empty docket', () => {
    expect(collectActs([], [], [])).toEqual([]);
  });
});
