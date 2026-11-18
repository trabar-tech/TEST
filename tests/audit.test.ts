/**
 * P1-T06 acceptance, asserted rather than eyeballed:
 *  - a camera-observed lie is caught 100% of the time
 *  - an honest filing never produces a review, over 1,000 simulated filings
 *  - every consequence on the sheet names a line and a reason
 *  - the audit is deterministic given its seed
 */

import { describe, expect, it } from 'vitest';
import { makeRng } from '@core/rng';
import { claimOf, makeLine, slack, type Claim, type ReportLine, type Truth } from '@core/record';
import { autoFile, runAudit, witnessComesForward } from '@systems/audit';

const truth = (over: Partial<Truth> = {}): Truth => ({
  classification: 'C',
  force_rung: 2,
  detainees: 1,
  casualties: 0,
  damage: 1,
  third_party_present: false,
  illegal_search: false,
  bribe_taken: false,
  ...over,
});

const lie = (over: Partial<Claim> = {}): Claim => ({
  classification: 'P',
  force_rung: 2,
  detainees: 1,
  casualties: 0,
  damage: 1,
  ...over,
});

let counter = 0;
function line(
  opts: {
    claim?: Claim;
    truth?: Truth;
    cameras?: string[];
    witnesses?: ReportLine['witnesses'];
    stability?: number;
    shift?: number;
  } = {},
): ReportLine {
  counter += 1;
  return makeLine({
    id: `r-1-${String(counter).padStart(2, '0')}`,
    shift: opts.shift ?? 1,
    event_ref: 'me-0031',
    category: 'inspection',
    claim: opts.claim ?? claimOf(truth()),
    truth: opts.truth ?? truth(),
    ...(opts.witnesses === undefined ? {} : { witnesses: opts.witnesses }),
    exposure: { cameras: opts.cameras ?? [] },
  });
}

describe('audit: determinism', () => {
  it('same input → same findings, sheet and risk', () => {
    const lines = [
      line({ claim: lie(), cameras: ['cam:K4-2'], witnesses: [{ id: 'c-0221', reliability: 0.9, will_talk: 0.9 }] }),
      line({ claim: lie(), witnesses: [{ id: 'c-0307', reliability: 0.7, will_talk: 1 }] }),
    ];
    const a = runAudit({ lines, rngSeed: 42 });
    const b = runAudit({ lines, rngSeed: 42 });
    expect(b).toEqual(a);
  });

  it('a different seed may change which witness speaks, but not the cameras', () => {
    const lines = [line({ claim: lie(), cameras: ['cam:K4-2'] })];
    for (const seed of [1, 2, 3, 999]) {
      const r = runAudit({ lines, rngSeed: seed });
      expect(r.findings.some((f) => f.kind === 'camera')).toBe(true);
    }
  });
});

describe('audit: camera-observed lies are caught 100%', () => {
  it('over 500 random lying claims with a camera in range', () => {
    const rng = makeRng(77);
    for (let i = 0; i < 500; i++) {
      const claim = lie({ detainees: rng.int(0, 4), damage: rng.int(0, 3) });
      const l = line({ claim, cameras: ['cam:K4-2'] });
      const r = runAudit({ lines: [l], rngSeed: i });
      const cameraFinding = r.findings.find((f) => f.kind === 'camera');
      expect(cameraFinding, `filing ${i}`).toBeDefined();
      expect(cameraFinding!.confidence).toBe(1);
      expect(r.destabilised).toContain(l.id);
    }
  });

  it('an honest line under a camera produces nothing', () => {
    const honest = line({ cameras: ['cam:K4-2', 'cam:annex-1'] });
    const r = runAudit({ lines: [honest], rngSeed: 5 });
    expect(r.findings).toHaveLength(0);
    expect(r.review).toBe(false);
    expect(r.sheet).toEqual(['CLEARED — nothing on this sheet was queried.']);
  });
});

describe('audit: honest filings never surprise the player', () => {
  it('over 1,000 honest filings with cameras and talkative witnesses', () => {
    const rng = makeRng(2024);
    for (let i = 0; i < 1000; i++) {
      const t = truth({
        detainees: rng.int(0, 3),
        damage: rng.int(0, 3),
        force_rung: (rng.int(1, 5) as Truth['force_rung']),
        classification: (['P', 'C', 'D', 'X', '-'] as const)[rng.int(0, 4)]!,
      });
      const l = line({
        claim: claimOf(t),
        truth: t,
        cameras: rng.chance(0.5) ? ['cam:K4-2'] : [],
        witnesses: rng.chance(0.5)
          ? [{ id: 'c-0221', reliability: rng.next(), will_talk: rng.next() }]
          : [],
      });
      expect(l.derived.slack).toBe(0);
      const r = runAudit({ lines: [l], rngSeed: i });
      expect(r.findings, `honest filing ${i}`).toHaveLength(0);
      expect(r.review).toBe(false);
    }
  });

  it('a witness who cannot talk can never speak', () => {
    const rng = makeRng(3);
    expect(witnessComesForward({ id: 'x', reliability: 1, will_talk: 0 }, 0, rng)).toBe(false);
    expect(witnessComesForward({ id: 'x', reliability: 0, will_talk: 1 }, 0, rng)).toBe(false);
    // a fully stable line gives nothing away, however reliable the witness
    expect(witnessComesForward({ id: 'x', reliability: 1, will_talk: 1 }, 1, rng)).toBe(false);
    // and a fresh, unreliable, unwilling witness almost never does
    let spoke = 0;
    for (let i = 0; i < 1000; i++) {
      if (witnessComesForward({ id: 'x', reliability: 0.2, will_talk: 0.2 }, 0.1, rng)) spoke += 1;
    }
    expect(spoke).toBeLessThan(60);
  });
});

describe('audit: legibility', () => {
  it('every finding names a line and offers a specific reason', () => {
    const lines = [
      line({ claim: lie(), cameras: ['cam:K4-2'], witnesses: [{ id: 'c-0221', reliability: 1, will_talk: 1 }] }),
    ];
    const r = runAudit({ lines, rngSeed: 1 });
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      expect(f.line_id).toMatch(/^r-1-/);
      expect(f.evidence.length).toBeGreaterThan(12);
    }
    for (const s of r.sheet) expect(s.length).toBeGreaterThan(10);
    expect(r.sheet.some((s) => s.startsWith('CAMERA'))).toBe(true);
  });

  it('accumulated risk decides the review, and says so on the sheet', () => {
    const many = Array.from({ length: 6 }, () => line({ claim: lie(), cameras: ['cam:K4-2'] }));
    const r = runAudit({ lines: many, rngSeed: 9 });
    expect(r.review_risk).toBeGreaterThanOrEqual(1);
    expect(r.review).toBe(true);
    expect(r.sheet.some((s) => s.startsWith('REVIEW'))).toBe(true);
  });

  it('contradictions between the player\'s own lines are surfaced', () => {
    const l = line({ claim: lie({ classification: 'D' }), shift: 1 });
    l.exposure.contradictions = ['r-1-00'];
    const r = runAudit({ lines: [l], rngSeed: 4 });
    const c = r.findings.find((f) => f.kind === 'contradiction');
    expect(c).toBeDefined();
    expect(c!.evidence).toContain('r-1-00');
  });

  it('the peer pattern test only fires on a real jump', () => {
    const big = line({ claim: lie({ classification: 'P', detainees: 4 }), truth: truth({ third_party_present: true }) });
    expect(big.derived.slack).toBeGreaterThan(0.35);

    const withHistory = runAudit({ lines: [big], rngSeed: 1, history: { meanSlack: 0.05, lines: 5 } });
    expect(withHistory.findings.some((f) => f.kind === 'pattern')).toBe(true);

    const consistent = runAudit({ lines: [big], rngSeed: 1, history: { meanSlack: big.derived.slack, lines: 5 } });
    expect(consistent.findings.some((f) => f.kind === 'pattern')).toBe(false);
  });
});

describe('silence', () => {
  it('auto-filing is a hostile reading, not a neutral one', () => {
    const honest = line({ cameras: ['cam:K4-2'] });
    const auto = autoFile(
      { ref: 'inc-014', shift: 2, cameras: ['cam:K4-2'], truthLine: honest },
      'r-2-01',
    );
    expect(auto.authority).toBe('ai_auto');
    expect(auto.claim.force_rung).toBeGreaterThanOrEqual(3);
    expect(auto.free_text).toBe('');
    expect(auto.derived.consequences).toContain('auto_filed');
    // filing nothing is worse than filing badly: it is *still* a line
    expect(slack(auto.claim, auto.truth)).toBeGreaterThan(0);
  });

  it('appears on the sheet as SILENCE', () => {
    const honest = line();
    const auto = autoFile({ ref: 'inc-014', shift: 2, cameras: [], truthLine: honest }, 'r-2-01');
    const r = runAudit({ lines: [honest], rngSeed: 2, autoFiled: [auto] });
    expect(r.sheet.some((s) => s.startsWith('SILENCE'))).toBe(true);
  });
});
