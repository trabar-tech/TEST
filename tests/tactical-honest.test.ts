/**
 * The fairness guarantee for the new audit rule (P2-T08).
 *
 * The tactical layer added findings the Phase 1 audit did not have. That makes
 * one thing non-negotiable: **an honest line must never meet them.** If it can,
 * the audit stops being a mirror and becomes a trap, and the whole game's premise
 * ("verify what you wrote, not what you did") collapses.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { makeLine } from '@core/record';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { runAudit } from '@systems/audit';
import { Incident } from '@systems/tactical/incident';
import { draftFromIncident, sceneFacts, truthFromIncident } from '@systems/tactical/paperwork';
import type { InteriorMapJson } from '@systems/tactical/types';
import type { OfficerDef } from '@systems/tactical/squad';

const __dirname = dirname(fileURLToPath(import.meta.url));
const interior = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/interior_flat14.json'), 'utf8'),
) as MapJson & InteriorMapJson;
const MAP = new TileMap(mapJsonToDef(interior));
const officers: OfficerDef[] = [
  { id: 'o-01', name: 'Renner', traits: ['disciplined'] },
  { id: 'o-02', name: 'Ferro', traits: ['jumpy'] },
];
const spawns = { 'o-01': { x: 8 * 32 + 16, y: 18 * 32 + 16 }, 'o-02': { x: 9 * 32 + 16, y: 19 * 32 + 16 } };

function run(script: (inc: Incident) => void, seed: number) {
  const inc = new Incident({
    seed,
    shift: 1,
    map: MAP,
    json: interior,
    forceIndex: { sector: 'kiln_row', value: 0 },
    officers,
    officerSpawns: spawns,
  });
  script(inc);
  const result = inc.result();
  const truth = truthFromIncident(result);
  const claim = draftFromIncident(result);
  const line = makeLine({
    id: 'r-1-01',
    shift: 1,
    event_ref: 'int-1-1',
    category: 'incident',
    claim,
    truth,
    tags: [],
  });
  line.scene = sceneFacts(result);
  return { line, result };
}

/** The scripts a careful player actually plays. None of them may be caught. */
const HONEST_SCRIPTS: Array<[string, (inc: Incident) => void]> = [
  ['knock and talk, nothing found', (inc) => inc.enterRoom('north', 'knock_talk', 1)],
  ['knock and talk, a detention', (inc) => {
    inc.enterRoom('north', 'knock_talk', 1);
    inc.applyForceTo('h-02', 2, { tool: 'hands' });
    inc.detain('h-02');
  }],
  ['stack on the front room', (inc) => inc.enterRoom('north', 'stack_enter', 2)],
  ['ram on a barred door, no force', (inc) => inc.enterRoom('south_w', 'ram', 1)],
  ['gas then a detention', (inc) => {
    inc.enterRoom('bsr', 'gas_wait', 2);
    inc.applyForceTo('h-01', 2, { tool: 'hands' });
    inc.detain('h-01');
  }],
  ['clear every room you can reach', (inc) => {
    for (const room of ['north', 'hall', 'south_w', 'south_e']) {
      const res = inc.enterRoom(room, 'knock_talk', 1);
      if (res.ok) inc.clearRoom(room);
    }
  }],
  ['unsearched, and said so', (inc) => inc.enterRoom('north', 'knock_talk', 1)],
];

describe('an honest incident line never meets the scene test', () => {
  for (const [name, script] of HONEST_SCRIPTS) {
    it(`survives 25 seeds: ${name}`, () => {
      for (let seed = 0; seed < 25; seed++) {
        const { line } = run(script, seed);
        expect(line.derived.slack, `seed ${seed}`).toBe(0);
        const audit = runAudit({ lines: [line], rngSeed: seed * 13 + 1 });
        const scene = audit.findings.filter((f) => f.kind === 'scene');
        expect(scene, `seed ${seed}: ${scene.map((f) => f.evidence).join('; ')}`).toEqual([]);
      }
    });
  }

  it('filing the truth gives no finding of any kind', () => {
    const { line } = run((inc) => inc.enterRoom('north', 'ram', 1), 3);
    const audit = runAudit({ lines: [line], rngSeed: 99 });
    expect(audit.findings).toEqual([]);
    expect(audit.review).toBe(false);
  });

  it('the same line with the classification softened IS caught', () => {
    const { line } = run((inc) => {
      inc.enterRoom('bsr', 'shotgun', 2);
      inc.applyForceTo('h-01', 4, { tool: 'firearm' });
    }, 3);
    line.claim = { ...line.claim, classification: 'P', force_rung: 1, damage: 0, property: [] };
    const audit = runAudit({ lines: [line], rngSeed: 99 });
    const scene = audit.findings.filter((f) => f.kind === 'scene');
    expect(scene.length).toBeGreaterThanOrEqual(2);
    expect(audit.review).toBe(true);
  });
});
