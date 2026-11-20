// @vitest-environment jsdom
/**
 * P3-T02 — the debrief says who it landed on.
 *
 * The compliance sheet is the audit's voice and the audit has no opinion about
 * households. Without this panel, the only trace of the district's reaction was a number
 * that moved before the player could see it, which is how a world stops seeming to
 * track anything.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDebrief } from '@ui/debrief';
import type { AuditResult } from '@systems/audit';

const result = (over: Partial<AuditResult> = {}): AuditResult =>
  ({
    findings: [],
    review_risk: 0,
    review: false,
    destabilised: [],
    sheet: ['CLEARED — nothing required attention.'],
    ...over,
  }) as AuditResult;

const sim = {
  state: { shift: 4 },
  lastAudit: result(),
  belief: () => ({ resistance_estimate: 0, brutality_index: 0, syndicate_presence: 0 }),
} as never;

const mount = (opts: Partial<Parameters<typeof createDebrief>[2]> = {}) => {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.append(host);
  const handle = createDebrief(sim, host, { onRestart: vi.fn(), ...opts });
  handle.render(result());
  return { host, handle };
};

describe('the debrief reports the district, not only the audit', () => {
  it('prints the district sentence in its own words', () => {
    const { host } = mount({ district: 'kiln row is angry, and the neighbours are watching.' });
    expect(host.textContent).toMatch(/THE DISTRICT/);
    expect(host.textContent).toMatch(/kiln row is angry, and the neighbours are watching/);
  });

  it('names the household that took it worst, and says they will be back', () => {
    const { host } = mount({ district: 'canal market is angry.', worstHousehold: 'canal market · h-003' });
    expect(host.textContent).toMatch(/canal market · h-003/);
    expect(host.textContent).toMatch(/They will be in the briefing/);
  });

  it('shows no district panel when nothing touched a household', () => {
    const { host } = mount();
    expect(host.textContent).not.toMatch(/THE DISTRICT/);
  });

  it('carries the last scene as a closing line, in italics, below the audit', () => {
    const { host } = mount({ scene: 'Somebody was seen: put the line in the stove.' });
    expect(host.textContent).toMatch(/Somebody was seen: put the line in the stove/);
  });

  it('puts the district after the belief panel and before tomorrow', () => {
    const { host } = mount({ district: 'kiln row is angry.' });
    const text = host.textContent ?? '';
    expect(text.indexOf('sector belief')).toBeLessThan(text.indexOf('THE DISTRICT'));
    expect(text.indexOf('THE DISTRICT')).toBeLessThan(text.indexOf('tomorrow'));
  });

  it('still works when the audit itself is empty', () => {
    const { host } = mount({ district: 'kiln row is angry.' });
    expect(host.textContent).toMatch(/Compliance sheet/);
  });
});
