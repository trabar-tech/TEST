/**
 * P2-T08 — the bridge. An incident becomes one line, the honest draft is the
 * default, and the door's noise is a fact in the file rather than a number in the
 * debrief.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Incident } from '@systems/tactical/incident';
import {
  audibleEvidence,
  classifyIncident,
  draftFromIncident,
  incidentDocket,
  propertyList,
  toolTagFor,
  truthFromIncident,
} from '@systems/tactical/paperwork';
import type { InteriorMapJson } from '@systems/tactical/types';
import type { OfficerDef } from '@systems/tactical/squad';
import { computeExposure, riskBand, slack } from '@core/record';

const __dirname = dirname(fileURLToPath(import.meta.url));
const interior = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/interior_flat14.json'), 'utf8'),
) as MapJson & InteriorMapJson;
const MAP = new TileMap(mapJsonToDef(interior));

const spawns = { 'o-01': { x: 8 * 32 + 16, y: 18 * 32 + 16 } };
const officers: OfficerDef[] = [{ id: 'o-01', name: 'Warden', traits: ['disciplined'] }];

function scene(run: (inc: Incident) => void) {
  const inc = new Incident({
    seed: 11,
    shift: 2,
    map: MAP,
    json: interior,
    forceIndex: { sector: 'kiln_row', value: 0 },
    officers,
    officerSpawns: spawns,
  });
  run(inc);
  return inc.result();
}

describe('an incident becomes a file', () => {
  it('a quiet knock with a finding is a C, not a drama', () => {
    const result = scene((inc) => {
      inc.enterRoom('north', 'knock_talk', 1);
    });
    expect(result.entryMethod).toBe('knock_talk');
    expect(classifyIncident(result)).toBe('P');
  });

  it('a detention after a ram is resistance-linked, not a clean D', () => {
    const result = scene((inc) => {
      inc.enterRoom('north', 'ram', 1);
      inc.applyForceTo('h-02', 2, { tool: 'hands' });
      inc.applyForceTo('h-02', 3, { tool: 'baton' });
      inc.detain('h-02');
    });
    expect(result.detainees).toBe(1);
    expect(classifyIncident(result)).toBe('R');
  });

  it('the tool tag is the highest rung actually used: one line, one tag', () => {
    const result = scene((inc) => {
      inc.enterRoom('bsr', 'ram', 1);
      inc.applyForceTo('h-01', 2, { tool: 'hands' });
      inc.applyForceTo('h-01', 3, { tool: 'baton' });
    });
    expect(toolTagFor(result)).toBe('compliance:baton');
    expect(truthFromIncident(result).force_rung).toBe(3);
    expect(result.forceUsed).toHaveLength(2);
  });

  it('no force means no tag at all, and the field is absent rather than empty', () => {
    const result = scene((inc) => {
      inc.enterRoom('north', 'knock_talk', 1);
    });
    expect(toolTagFor(result)).toBeUndefined();
    expect('force_tool' in truthFromIncident(result)).toBe(false);
  });

  it('the honest draft is the default, and it matches the truth exactly', () => {
    const result = scene((inc) => {
      inc.enterRoom('north', 'ram', 1);
      inc.applyForceTo('h-02', 2, { tool: 'hands' });
    });
    const draft = draftFromIncident(result);
    const truth = truthFromIncident(result);
    expect(draft.classification).toBe(truth.classification);
    expect(slack(draft, truth)).toBe(0);
  });

  it('the door shows up in the file as property, not as a footnote', () => {
    const result = scene((inc) => {
      inc.enterRoom('north', 'ram', 1);
      inc.applyForceTo('h-02', 4, { tool: 'firearm' });
      inc.enterRoom('bsr', 'shotgun', 1);
    });
    const props = propertyList(result);
    expect(props).toContain('door_damage');
    expect(props).toContain('structural_damage');
    expect(props).toContain('audible_from_street');
    expect(props).toContain('force_without_authorisation');
  });

  it('an unsearched flat says so, because the record is what makes it matter', () => {
    const result = scene((inc) => {
      inc.enterRoom('north', 'knock_talk', 1);
    });
    expect(result.unfound.length).toBeGreaterThan(0);
    expect(propertyList(result)).toContain('premises_not_fully_searched');
  });

  it('the docket card is honest and one edit away from being a lie', () => {
    const result = scene((inc) => {
      inc.enterRoom('north', 'ram', 1);
      inc.applyForceTo('h-02', 2, { tool: 'hands' });
      inc.applyForceTo('h-02', 3, { tool: 'baton' });
      inc.detain('h-02');
    });
    const docket = incidentDocket({ ref: 'int:flat14', address: 'Block C, flat 14', result });
    expect(docket.kind).toBe('incident');
    expect(docket.draft.classification).toBe('R');
    expect(docket.tags_hint).toContain('excessive_force_risk');

    // now the lie: file it as a clean detention with no force
    const lie = { ...docket.draft, classification: 'D' as const, force_rung: 1 as const, force_tool: undefined };
    const truth = docket.truth;
    expect(slack(lie, truth)).toBeGreaterThan(0.3);
    const exposure = computeExposure({
      candidate: lie,
      truth,
      cameras: ['cam:stairwell'],
      witnesses: [{ id: 'w-1', reliability: 0.7, will_talk: 0.6 }],
      contradictions: [],
    });
    expect(riskBand(exposure.risk_score)).not.toBe('safe');
  });

  it('the noise a neighbour heard is stated as evidence', () => {
    const loud = scene((inc) => inc.enterRoom('north', 'ram', 1));
    const quiet = scene((inc) => inc.enterRoom('north', 'knock_talk', 1));
    expect(audibleEvidence(loud).heard).toBe(true);
    expect(audibleEvidence(loud).text).toMatch(/neighbour/);
    expect(audibleEvidence(quiet).heard).toBe(false);
  });

  it('a scene with no force and no entry still files cleanly', () => {
    const empty = scene(() => {});
    const docket = incidentDocket({ ref: 'int:none', address: 'nowhere', result: empty });
    expect(slack(docket.draft, docket.truth)).toBe(0);
    expect(docket.draft.classification).toBe('P');
  });
});
