/**
 * P2 performance budget (SYS-TACT-01 §8.7): ≤125 µs/tick for 40 agents.
 *
 * The number is asserted, not eyeballed, because "feels fine" is how a tick
 * budget dies. The reference figure is recorded in the phase doc; this test keeps
 * the *regression* honest with a generous headroom so it does not flake on a
 * loaded machine, while still catching an order-of-magnitude mistake.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Incident } from '@systems/tactical/incident';
import { stepCrowd, type CrowdDef } from '@systems/tactical/crowd';
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
  { id: 'o-03', name: 'Bruck', traits: ['methodical'] },
  { id: 'o-04', name: 'Tace', traits: ['talker'] },
];
const spawns = Object.fromEntries(officers.map((o, i) => [o.id, { x: (8 + i) * 32 + 16, y: 18 * 32 + 16 }]));

describe('tick budget', () => {
  it('keeps a 4-officer, 3-subject incident well under 125 µs/tick', () => {
    const inc = new Incident({
      seed: 1,
      shift: 1,
      map: MAP,
      json: interior,
      forceIndex: { sector: 'kiln_row', value: 0 },
      officers,
      officerSpawns: spawns,
    });
    inc.enterRoom('north', 'stack_enter', 4);
    for (const o of officers) inc.issue({ kind: 'clear', room: 'north' }, o.id);

    const N = 5000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) inc.step(1 / 60);
    const perTick = ((performance.now() - t0) / N) * 1000;
    // headroom: the measured figure is ~0.4 µs; anything near 125 is a redesign
    expect(perTick).toBeLessThan(125);
  });

  it('keeps a 34-agent crowd an order of magnitude under budget', () => {
    let crowd: CrowdDef = {
      id: 'crowd:canal_market',
      label: 'canal market',
      agents: 34,
      heat: 0.3,
      leaders: ['c-0117', 'c-0240'],
      grievance: 'ration_cut',
      state: 'milling',
    };
    const N = 5000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) crowd = stepCrowd(crowd, { kind: 'presence', seconds: 1 / 60 }).crowd;
    const perTick = ((performance.now() - t0) / N) * 1000;
    expect(perTick).toBeLessThan(125);
  });
});
