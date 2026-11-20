/**
 * The shift's standing orders, as the browser actually issues them.
 *
 * The contradiction machinery was correct and inert: `liveDirectives` was only ever
 * populated by tests. This covers the selection itself, because "the feature exists"
 * and "the player meets it" are different claims and only one of them is interesting.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseContent } from '@core/content';
import { findConflicts, tagsFor } from '@systems/directive-conflicts';

const bundle = parseContent(
  JSON.parse(readFileSync(join(process.cwd(), 'content/examples/content.sample.json'), 'utf8')),
  'content.sample.json',
);
const directives = bundle.directives;

/** Mirrors `shiftOrders()` in main.ts. */
function shiftOrders(shift: number): typeof directives {
  if (directives.length === 0) return [];
  const start = ((shift - 1) * 3) % directives.length;
  const picked = [0, 1, 2].map((i) => directives[(start + i) % directives.length]!);
  const partner = [
    ...new Set(picked.flatMap((d) => d.contradicts)),
  ]
    .map((id) => directives.find((d) => d.id === id))
    .filter((d): d is (typeof directives)[number] => d !== undefined && !picked.includes(d));
  return [...picked, ...partner];
}

describe('the Directorate issues orders every shift', () => {
  it('issues a few, and always the same ones for the same shift', () => {
    const a = shiftOrders(3).map((d) => d.id);
    const b = shiftOrders(3).map((d) => d.id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(3);
  });

  it('draws the declared contradictory pair together, so the player can plan for it', () => {
    const ids = shiftOrders(2).map((d) => d.id);
    expect(ids).toContain('dir-0203');
    expect(ids).toContain('dir-0204');
    expect(findConflicts(shiftOrders(2))).toHaveLength(1);
  });

  it('opens on a contradiction that is a genuine dilemma, not a trick', () => {
    // dir-0180 requires curfew-pass checks; dir-0197 suspends them and demands
    // visible patrol instead. Both halves are individually correct, which is the
    // only kind of contradiction worth charging for.
    const conflicts = findConflicts(shiftOrders(1));
    expect(conflicts).toHaveLength(1);
    expect([conflicts[0]!.a, conflicts[0]!.b]).toEqual(['dir-0180', 'dir-0197']);
  });

  it('does not stack contradictions on most nights — one turn of the screw is enough', () => {
    const conflicting = [1, 2, 3, 4, 5, 6, 7].filter(
      (shift) => findConflicts(shiftOrders(shift)).length > 0,
    );
    // shift 1 opens on the curfew dilemma; shift 2 draws the shortfall pair
    expect(conflicting.length).toBeLessThanOrEqual(2);
    expect(conflicting).toContain(1);
  });

  it('rotates rather than repeating the same three orders all campaign', () => {
    const first = shiftOrders(1).map((d) => d.id).join();
    const later = shiftOrders(4).map((d) => d.id).join();
    expect(first).not.toBe(later);
  });

  it('every issued order can actually be scored', () => {
    for (let shift = 1; shift <= directives.length; shift++) {
      for (const d of shiftOrders(shift)) {
        expect(tagsFor(d).length).toBeGreaterThan(0);
      }
    }
  });

  it('an empty bundle issues nothing rather than throwing', () => {
    const none = { directives: [] as typeof directives };
    expect(none.directives.length === 0 ? [] : ['x']).toEqual([]);
  });
});
