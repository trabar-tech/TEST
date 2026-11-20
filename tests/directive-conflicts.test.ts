/**
 * P3-T11 — standing orders that contradict each other, and the audit that charges
 * for it.
 *
 * The graph was detected and warned about since Phase 0; nothing *enforced* it, which
 * made it a comment. The rule now: two orders that cannot both be satisfied means
 * performing the shared act breaks one of them, and the sheet names which.
 *
 * The failure mode this must never have is the ambush — a contradiction the player
 * discovers only on the audit sheet. Hence `conflictWarnings()`, which the desk
 * shows *before* signing, and which is tested as hard as the finding itself.
 */

import { describe, expect, it } from 'vitest';
import type { Directive } from '@core/content';
import type { ReportLine } from '@core/record';
import {
  actsOf,
  conflictWarnings,
  expandActs,
  directiveFindings,
  findConflicts,
  satisfiedDirectives,
  tagsFor,
} from '@systems/directive-conflicts';
import { runAudit } from '@systems/audit';

const directive = (id: string, over: Partial<Directive> & Record<string, unknown> = {}): Directive =>
  ({
    id,
    type: 'standing',
    text: `${id} text`,
    quota: null,
    contradicts: [],
    tags: [],
    audit_weight: 1,
    ...over,
  }) as unknown as Directive;

const line = (id: string, classification: string, tags: string[] = []): ReportLine =>
  ({
    id,
    event_ref: `ev-${id}`,
    claim: { classification },
    tags,
    derived: { slack: 0, caught: false, consequences: [] },
    exposure: { cameras: [], camera_blocked: true, witnesses: [], contradictions: [], risk_score: 0 },
    witnesses: [],
    stability: 1,
    shift: 1,
  }) as unknown as ReportLine;

describe('which acts an order demands', () => {
  it('prefers tags the author wrote, falls back to the table for the existing corpus', () => {
    expect(tagsFor(directive('x', { tags: ['inspection'] }))).toEqual(['inspection']);
    expect(tagsFor(directive('dir-0201'))).toEqual(['patrol']);
    expect(tagsFor(directive('nobody-tagged-me'))).toEqual([]);
  });

  it('a filed line performs the acts its classification implies', () => {
    expect(actsOf(line('l1', 'C'))).toContain('clear');
    expect(actsOf(line('l2', 'P'))).toContain('arrest');
    expect(actsOf(line('l3', '-', ['patrol']))).toContain('patrol');
    expect(actsOf(line('l4', 'NR')).size).toBe(0);
  });
});

describe('filing tags become directive acts', () => {
  // The bug this table fixes: the desk tags a line with what it *noticed*
  // (`insufficient_papers`), while the order talks about `inspection`. Comparing
  // those strings directly is why the warning never fired.
  it('maps a noticed defect to the act an order would demand', () => {
    expect(expandActs(['insufficient_papers'])).toContain('inspection');
    expect(expandActs(['insufficient_papers'])).toContain('insufficient_papers');
    expect(expandActs(['resisting'])).toContain('arrest');
  });

  it('invents nothing for an unknown tag', () => {
    expect([...expandActs(['something_new'])]).toEqual(['something_new']);
  });

  it('a filed inspection with a defect tag satisfies an inspection order', () => {
    const live = [directive('a', { tags: ['inspection'] })];
    expect(satisfiedDirectives(live, [line('l1', 'R', ['insufficient_papers'])])).toEqual(['a']);
  });
});

describe('finding the contradictions', () => {
  it('finds a declared pair, and says why in one sentence', () => {
    const conflicts = findConflicts([
      directive('a', { tags: ['inspection'], contradicts: ['b'] }),
      directive('b', { tags: ['inspection'], contradicts: ['a'] }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.sentence).toMatch(/cannot both be obeyed/);
    expect(conflicts[0]!.act).toBe('inspection');
  });

  it('finds the shipped pair in the sample content, which is the fixture', () => {
    const conflicts = findConflicts([
      directive('dir-0203', { contradicts: ['dir-0204'], tags: ['report_shortfall'] }),
      directive('dir-0204', { contradicts: ['dir-0203'], tags: ['resolve_shortfall'] }),
    ]);
    // different acts, but the pair declares a contradiction — that is enough
    expect(conflicts).toHaveLength(1);
  });

  it('does not invent conflicts between unrelated orders', () => {
    expect(
      findConflicts([
        directive('a', { tags: ['patrol'] }),
        directive('b', { tags: ['inspection'] }),
      ]),
    ).toEqual([]);
  });

  it('is stable regardless of the order the orders arrive in', () => {
    const a = directive('a', { tags: ['patrol'], contradicts: ['b'] });
    const b = directive('b', { tags: ['patrol'], contradicts: ['a'] });
    expect(findConflicts([a, b]).map((c) => [c.a, c.b])).toEqual(findConflicts([b, a]).map((c) => [c.a, c.b]));
  });
});

describe('the audit charges for it', () => {
  const live = [
    directive('a', { tags: ['inspection'], contradicts: ['b'] }),
    directive('b', { tags: ['inspection'], contradicts: ['a'] }),
  ];

  it('charges both, and names the line that did it', () => {
    const findings = directiveFindings({
      lines: [line('l1', 'R', ['inspection'])],
      state: { live, satisfied: ['a', 'b'] },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('directive');
    expect(findings[0]!.line_id).toBe('l1');
    expect(findings[0]!.evidence).toMatch(/obeyed a and b/);
    expect(findings[0]!.weight).toBeGreaterThan(0.3);
  });

  it('charges less when only one half was obeyed — but still charges', () => {
    const both = directiveFindings({ lines: [line('l1', 'R', ['inspection'])], state: { live, satisfied: ['a', 'b'] } });
    const one = directiveFindings({ lines: [line('l1', 'R', ['inspection'])], state: { live, satisfied: ['a'] } });
    expect(one).toHaveLength(1);
    expect(one[0]!.evidence).toMatch(/broke b/);
    expect(one[0]!.weight).toBeLessThan(both[0]!.weight);
  });

  it('charges nothing when the shift never touched the shared act', () => {
    expect(
      directiveFindings({ lines: [line('l1', 'C')], state: { live, satisfied: [] } }),
    ).toEqual([]);
  });

  it('no live orders means no findings at all, not an empty finding', () => {
    expect(directiveFindings({ lines: [line('l1', 'R', ['inspection'])], state: { live: [], satisfied: [] } })).toEqual([]);
  });

  it('reaches the audit sheet through runAudit, labelled in words a person reads', () => {
    const result = runAudit({
      lines: [line('l1', 'R', ['inspection'])],
      rngSeed: 1,
      directives: { live, satisfied: ['a', 'b'] },
    });
    expect(result.findings.some((f) => f.kind === 'directive')).toBe(true);
    expect(result.sheet.join(' ')).toMatch(/STANDING ORDER — l1:/);
    expect(result.destabilised).toContain('l1');
  });

  it('and the risk it adds can tip a clean sheet into review', () => {
    const clean = runAudit({ lines: [line('l1', 'R', ['inspection'])], rngSeed: 1 });
    const conflicted = runAudit({
      lines: [line('l1', 'R', ['inspection'])],
      rngSeed: 1,
      directives: { live, satisfied: ['a', 'b'] },
    });
    expect(clean.review).toBe(false);
    expect(conflicted.review_risk).toBeGreaterThan(clean.review_risk);
  });
});

describe('which orders were obeyed tonight', () => {
  it('is derived from the lines, not from the player saying so', () => {
    const live = [directive('a', { tags: ['patrol'] }), directive('b', { tags: ['camera'] })];
    expect(satisfiedDirectives(live, [line('l1', '-', ['patrol'])])).toEqual(['a']);
    expect(satisfiedDirectives(live, [])).toEqual([]);
  });

  it('a clear satisfies a clear order even without a tag', () => {
    const live = [directive('c', { tags: ['clear'] })];
    expect(satisfiedDirectives(live, [line('l1', 'C')])).toEqual(['c']);
  });
});

describe('the desk warns before signing, never after', () => {
  const live = [
    directive('a', { tags: ['inspection'], contradicts: ['b'] }),
    directive('b', { tags: ['inspection'], contradicts: ['a'] }),
  ];

  it('warns when the act about to be filed is the contested one', () => {
    const warnings = conflictWarnings(live, ['inspection']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/satisfies one and breaks the other/);
  });

  it('stays quiet when the act is unrelated', () => {
    expect(conflictWarnings(live, ['camera'])).toEqual([]);
  });

  it('stays quiet when nothing conflicts, so the gutter is not noisy', () => {
    expect(conflictWarnings([directive('a', { tags: ['patrol'] })], ['patrol'])).toEqual([]);
  });

  it('does not repeat itself when two orders both flag the same act', () => {
    const trio = [
      directive('a', { tags: ['inspection'], contradicts: ['b'] }),
      directive('b', { tags: ['inspection'], contradicts: ['a'] }),
    ];
    const warnings = conflictWarnings(trio, ['inspection', 'inspection']);
    expect(new Set(warnings).size).toBe(warnings.length);
  });
});
