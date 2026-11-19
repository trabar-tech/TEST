/** P2-T07: the crowd is a mood graph with hysteresis, and the tools are legible. */

import { describe, expect, it } from 'vitest';
import { dispersalOutcome, heatBand, stepCrowd, HEAT_THRESHOLDS, type CrowdDef } from '@systems/tactical/crowd';

const crowd = (over: Partial<CrowdDef> = {}): CrowdDef => ({
  id: 'crowd:canal_market',
  label: 'canal market',
  agents: 34,
  heat: 0.22,
  leaders: ['c-0117', 'c-0240'],
  grievance: 'ration_cut',
  state: 'milling',
  ...over,
});

describe('crowd mood', () => {
  it('presence cools a milling crowd without touching its grievance', () => {
    const out = stepCrowd(crowd(), { kind: 'presence', seconds: 4 });
    expect(out.crowd.heat).toBeLessThan(0.22);
    expect(out.grievance).toBe('ration_cut');
    expect(out.legitimacy).toBeGreaterThan(0);
    expect(out.crowd.state).toBe('milling');
  });

  it('arresting a leader heats the street and moves it toward surging', () => {
    const out = stepCrowd(crowd({ heat: 0.4, state: 'chanting' }), { kind: 'arrest_leader' });
    expect(out.crowd.heat).toBeCloseTo(0.75, 2);
    expect(out.crowd.state).toBe('surging');
    expect(out.legitimacy).toBeLessThan(0);
  });

  it('gas makes a riot, which is the worst thing you can do to a market', () => {
    const out = stepCrowd(crowd({ heat: 0.4 }), { kind: 'gas' });
    expect(out.crowd.state).toBe('riot');
    expect(out.standing).toBe(-2);
  });

  it('the loudhailer only works below half heat, which is a real tactical constraint', () => {
    const cold = stepCrowd(crowd({ heat: 0.2 }), { kind: 'loudhailer' });
    expect(cold.crowd.state).toBe('dispersing');
    const hot = stepCrowd(crowd({ heat: 0.8, state: 'surging' }), { kind: 'loudhailer' });
    expect(hot.crowd.state).toBe('surging');
    expect(hot.crowd.heat).toBeGreaterThan(0.8);
  });

  it('withdrawal is a low-standing, high-legitimacy outcome', () => {
    const out = stepCrowd(crowd({ heat: 0.5, state: 'chanting' }), { kind: 'withdraw', seconds: 4 });
    expect(out.crowd.state).toBe('milling');
    expect(out.standing).toBeLessThan(0);
    expect(out.legitimacy).toBeGreaterThan(0);
  });

  it('heat never escapes 0–1', () => {
    expect(stepCrowd(crowd({ heat: 0.98 }), { kind: 'gas' }).crowd.heat).toBe(1);
    expect(stepCrowd(crowd({ heat: 0.02 }), { kind: 'single_voice', seconds: 20 }).crowd.heat).toBe(0);
  });

  it('an idle crowd cools and re-derives its state from heat', () => {
    const out = stepCrowd(crowd({ heat: 0.7, state: 'surging' }), { kind: 'idle', seconds: 12 });
    expect(out.crowd.heat).toBeLessThan(0.7);
    expect(out.crowd.state).toBe('chanting');
  });

  it('reports a band, not a number, for the ground ring', () => {
    expect(heatBand(0.2)).toBe('calm');
    expect(heatBand(HEAT_THRESHOLDS.chant + 0.01)).toBe('warm');
    expect(heatBand(HEAT_THRESHOLDS.surge + 0.01)).toBe('hot');
    expect(heatBand(0.99)).toBe('critical');
  });

  it('dispersing without arrests is the Directorate\'s question, not a win', () => {
    const out = dispersalOutcome(crowd({ state: 'dispersing' }), 0);
    expect(out.highLegitimacy).toBe(true);
    expect(out.lowStanding).toBe(true);
    expect(out.directorateQuestion).toMatch(/no detentions/);
    expect(dispersalOutcome(crowd({ state: 'riot' }), 4).directorateQuestion).toMatch(/escalation/);
  });
});

describe('a crowd becomes a line, like everything else', () => {
  it('dockets as an incident card with the same shape as a raid', async () => {
    const { crowdDocket } = await import('@systems/tactical/paperwork');
    const crowd = {
      id: 'crowd:canal_market',
      label: 'canal market',
      agents: 34,
      heat: 0.31,
      leaders: ['c-0117'],
      grievance: 'ration_cut',
      state: 'dispersing' as const,
    };
    const docket = crowdDocket({
      ref: 'crw-1-1',
      address: 'Canal market, south corner',
      crowd,
      arrests: 0,
      peakState: 'chanting',
      legitimacy: 2,
    });
    expect(docket.kind).toBe('incident');
    expect(docket.draft.classification).toBe('P');
    expect(docket.draft.detainees).toBe(0);
    expect(docket.tags_hint).toContain('crowd');
    expect(docket.note).toMatch(/no detentions/);
    expect(docket.scene.entry).toBe('crowd');
  });

  it('detaining people changes the classification and the Directorate\'s question', async () => {
    const { crowdDocket } = await import('@systems/tactical/paperwork');
    const docket = crowdDocket({
      ref: 'crw-1-2',
      address: 'Canal market',
      crowd: {
        id: 'crowd:canal_market',
        label: 'canal market',
        agents: 34,
        heat: 0.9,
        leaders: [],
        grievance: 'ration_cut',
        state: 'riot',
      },
      arrests: 2,
      peakState: 'riot',
      legitimacy: -3,
    });
    expect(docket.draft.classification).toBe('D');
    expect(docket.draft.detainees).toBe(2);
    expect(docket.note).toMatch(/detained/);
  });
});
