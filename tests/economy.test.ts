/**
 * SYS-ECON-01 §6 — the household ledger.
 *
 * The spec's own claims are about *rates* ("a player who never lies fails rent ~30% of the
 * time in Act II"), which is a campaign-runner question. These tests cover the arithmetic
 * and the two rules that are load-bearing: four lines, and a floor that is a scene rather
 * than a fail state.
 */

import { describe, expect, it } from 'vitest';
import {
  DEBT_FLOOR,
  MAX_LINES,
  RENT,
  FOOD,
  MEDICINE,
  insolvencyGap,
  mayPromote,
  resolveLedger,
  standardLines,
  supplyPressure,
  wage,
} from '@systems/economy';

const lines = standardLines({ medicine: true });
const need = (cost: number) => ({ kind: 'need' as const, label: 'A school permit', cost });

describe('the night is four lines, and four is enforced', () => {
  it('a standard night is rent, food, medicine', () => {
    expect(lines.map((l) => l.kind)).toEqual(['rent', 'food', 'medicine']);
    expect(lines.reduce((a, l) => a + l.cost, 0)).toBe(RENT + FOOD + MEDICINE);
  });

  it('a rotating need is the fourth line, and a fifth is refused at build time', () => {
    const withNeed = standardLines({ medicine: true, need: need(20) });
    expect(withNeed).toHaveLength(MAX_LINES);
    expect(withNeed.at(-1)!.kind).toBe('need');
  });

  it('refuses a five-line ledger instead of quietly dropping one', () => {
    expect(() =>
      resolveLedger({ income: 100, lines: [...lines, need(8), need(9)] }),
    ).toThrow(/the ledger is 4 lines/);
  });
});

describe('paying the night', () => {
  it('a wage that covers everything leaves a balance and no unpaid lines', () => {
    const r = resolveLedger({ income: 100, lines });
    expect(r.unpaid).toEqual([]);
    expect(r.balance).toBe(100 - (RENT + FOOD + MEDICINE));
    expect(r.summary).toMatch(/rent is paid/);
  });

  it('pays in declaration order: the need is dropped before the rent', () => {
    // income covers rent + food + medicine but not the need
    const r = resolveLedger({ income: RENT + FOOD + MEDICINE, lines: [...lines, need(25)] });
    expect(r.unpaid.map((u) => u.kind)).toEqual(['need']);
    expect(r.summary).toBe('The a school permit did not get paid tonight.');
  });

  it('drops the medicine before the food when the money is short', () => {
    const r = resolveLedger({ income: RENT + FOOD, lines });
    expect(r.unpaid.map((u) => u.kind)).toEqual(['medicine']);
  });

  it('names every line it could not pay, not just the total', () => {
    const r = resolveLedger({ income: 10, lines });
    expect(r.unpaid.map((u) => u.kind)).toEqual(['rent', 'food', 'medicine']);
    expect(r.summary).toMatch(/rent and food and medicine/);
  });
});

describe('debt is the one pressure a player cannot out-skill', () => {
  it('carries a prior balance forward', () => {
    const r = resolveLedger({ income: 40, priorBalance: -10, lines });
    expect(r.balance).toBe(40 - 10 - (RENT + FOOD + MEDICINE));
  });

  it('stops at the floor rather than running away', () => {
    const r = resolveLedger({ income: 0, priorBalance: -50, lines });
    expect(r.balance).toBe(DEBT_FLOOR);
  });

  it('reports the floor on the night it is first touched, and beyond it', () => {
    expect(resolveLedger({ income: 0, priorBalance: -50, lines }).atFloor).toBe(true);
    // deep in debt the flag stays on: the Syndicate's offer is not a one-night event
    expect(resolveLedger({ income: 0, priorBalance: -60, lines }).atFloor).toBe(true);
  });

  it('is not at the floor merely because this night was bad, if the night can be survived', () => {
    // one night's shortfall is 40, well inside the floor
    const r = resolveLedger({ income: 0, priorBalance: -20, lines: lines.slice(0, 2) });
    expect(r.balance).toBe(-60);
    expect(resolveLedger({ income: 30, priorBalance: 0, lines: lines.slice(0, 2) }).atFloor).toBe(false);
  });

  it('at the spec\'s own numbers one night at the floor is unavoidable — see the doc', () => {
    // This asserts the *contradiction* rather than hiding it. If someone reconciles the
    // tables, this test must be rewritten and 05-phase-4-entry.md §5 updated in the same
    // commit. A silently "fixed" balance would make the whole curve untraceable.
    const gap = insolvencyGap();
    expect(gap.wage).toBeLessThan(gap.bill);
    const night = resolveLedger({ income: gap.wage, lines });
    expect(night.unpaid).toHaveLength(3);
  });

  it('is recoverable when income can cover the bill at all', () => {
    // SYS-ECON-01 acceptance check 3 at the arithmetic level: with an income that clears
    // the bill, two shifts of surplus clear a 40 FP debt. (With the spec's current wage
    // table no such income exists — the next test states that instead of pretending.)
    let balance = -40;
    let shifts = 0;
    while (balance < 0 && shifts < 6) {
      balance = resolveLedger({ income: 67 + 20, priorBalance: balance, lines }).balance;
      shifts++;
    }
    expect(shifts).toBe(2);
  });
});

describe('promotion adds a verb, so the rule is gated, not earned', () => {
  it('needs standing, a clean recent record and one favourable audit', () => {
    expect(mayPromote({ standing: 30, tier: 2, reviewsInLast3: 0, favourableAudit: true })).toBe(true);
    expect(mayPromote({ standing: 30, tier: 2, reviewsInLast3: 1, favourableAudit: true })).toBe(false);
    expect(mayPromote({ standing: 30, tier: 2, reviewsInLast3: 0, favourableAudit: false })).toBe(false);
    expect(mayPromote({ standing: 2, tier: 2, reviewsInLast3: 0, favourableAudit: true })).toBe(false);
  });

  it('the ladder gets steeper by tier', () => {
    expect(mayPromote({ standing: 12, tier: 1, reviewsInLast3: 0, favourableAudit: true })).toBe(true);
    expect(mayPromote({ standing: 12, tier: 4, reviewsInLast3: 0, favourableAudit: true })).toBe(false);
  });
});

describe('the personal economy reaches the district, narrowly', () => {
  it('a paid week lowers supply pressure a little', () => {
    expect(supplyPressure(resolveLedger({ income: 100, lines }))).toBeLessThan(0);
  });

  it('an unpaid week raises it, capped so rent is not the whole weather', () => {
    const broke = supplyPressure(resolveLedger({ income: 0, lines }));
    expect(broke).toBeGreaterThan(0);
    expect(broke).toBeLessThanOrEqual(0.12);
  });
});
