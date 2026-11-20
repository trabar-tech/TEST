import { TUNING, type Tuning } from '@core/tuning';

/**
 * The household ledger (P4-T02, first half): *the job should cost rent.*
 *
 * The campaign runner found that the sector's temperature barely moves over fifteen shifts,
 * because nothing in the loop touches supply, force index or faction heat. The reason is
 * simple: the game had no economy. A Warden with no rent has no reason to hit quota, and a
 * quota nobody needs is a number, not a pressure.
 *
 * This module is deliberately the *arithmetic* only — four lines, a wage, a debt floor. It
 * does not render a ledger, decide a borrow branch, or write family content. Those are
 * content threads (`SYS-ECON-01` §6.2); this is the thing they hang from, and the thing the
 * runner can sweep.
 *
 * Two rules from the spec are load-bearing and are encoded here rather than in a comment:
 *
 * 1. **Four lines, hard cap.** A fifth line is how an economy turns into a spreadsheet.
 * 2. **Debt to −60, and −60 is an authored scene, not a fail state.** The ledger reports
 *    that the floor was reached; what happens next is content's business.
 */

export type LedgerLineKind = 'rent' | 'food' | 'medicine' | 'need';

export interface LedgerLine {
  kind: LedgerLineKind;
  label: string;
  /** FP owed; always positive */
  cost: number;
}

export interface LedgerOptions {
  /** wages, penalties, bribes that were noticed — already netted by the caller */
  income: number;
  lines: readonly LedgerLine[];
  /** days already in debt, so the first night is not the fourth night */
  priorBalance?: number;
}

export interface LedgerResult {
  income: number;
  /** total owed tonight */
  owed: number;
  /** income − owed, before the balance is added */
  delta: number;
  /** balance after tonight, floored at −60 */
  balance: number;
  /** what could not be paid tonight, in the order the lines were declared */
  unpaid: LedgerLine[];
  /** true the first night the floor is touched — the Syndicate's offer comes due */
  atFloor: boolean;
  /** the single sentence the household would say about tonight */
  summary: string;
}

/** The spec's debt floor, from `tuning.json`. Not a fail state: a scene. */
export const DEBT_FLOOR = TUNING.economy.debt_floor;

/**
 * **OPEN DESIGN QUESTION — the wage table and the ledger cannot both be right.**
 *
 * `SYS-ECON-01` §3 gives `wage = 8 + rank × 2`, so 10 FP at rank 1 and 18 at rank 5 (§3's
 * own table says 21 at rank 5, which is a third inconsistency). §6.1 gives a nightly bill
 * of rent 30 + food 22 + medicine 15 = 67 FP.
 *
 * Measured, not asserted:
 *
 * | rank | wage | bill | night's balance | lines paid |
 * |---|---|---|---|---|
 * | 1 | 10 | 67 | −57 | none |
 * | 3 | 14 | 67 | −53 | none |
 * | 5 | 18 | 67 | −49 | none |
 *
 * Every rank is insolvent on night one, and a *single* missed night (67) exceeds the −60
 * debt floor. So the ledger is arithmetically correct and the balance is nonsense: at these
 * numbers the Warden never eats, and the "barely afford rent in Act II" curve the spec asks
 * for (§8 check 1) has no range to live in.
 *
 * This cannot be reconciled from inside the code — it is a design decision, and inventing a
 * number here would hide it. The ledger is therefore built and tested but **not yet wired
 * into the campaign loop**; see `05-phase-4-entry.md` §5 for the three candidate fixes.
 */
export function insolvencyGap(t: Tuning = TUNING): { wage: number; bill: number; gap: number } {
  const bill = t.economy.rent + t.economy.food + t.economy.medicine;
  return { wage: wage(1, false, t), bill, gap: bill - wage(1, false, t) };
}

/** No more than four lines by default; the hard cap lives in `tuning.json` so a mod or a
 *  what-if can move it — but the *rule* (`resolveLedger` refuses more) does not move. */
export const MAX_LINES = TUNING.economy.max_lines;

/**
 * Wage by rank tier (`SYS-ECON-01` §3), read from `tuning.json`: base + rank × per-rank,
 * capped by the table's own ceiling (18 from the formula, 21 in the table — see the
 * contradiction note above).
 */
export function wage(rank: number, quotaMet: boolean = false, t: Tuning = TUNING): number {
  const r = Math.max(1, Math.min(5, rank));
  const base = Math.min(t.economy.wage_cap, t.economy.wage_base + r * t.economy.wage_per_rank);
  return base + (quotaMet ? t.economy.quota_bonus : 0);
}

/**
 * The standard night's bill for a household with a sick spouse and one rotating need.
 *
 * Ordering is fixed: rent, then food, then medicine, then the need. A household that cannot
 * make rent does not buy medicine first — the fiction is that the need is the thing you
 * drop, and the ledger has to encode that or the choice is not real.
 */
export function standardLines(
  opts: { medicine: boolean; need?: LedgerLine },
  t: Tuning = TUNING,
): LedgerLine[] {
  const lines: LedgerLine[] = [
    { kind: 'rent', label: 'Rent', cost: t.economy.rent },
    { kind: 'food', label: 'Food', cost: t.economy.food },
  ];
  if (opts.medicine) lines.push({ kind: 'medicine', label: 'Medicine', cost: t.economy.medicine });
  if (opts.need) lines.push(opts.need);
  return lines.slice(0, t.economy.max_lines);
}

/**
 * Resolve one night.
 *
 * `unpaid` is not an error: it is the interesting output. Each unpaid line is a consequence
 * the caller turns into content (notice served, family health down, the spouse's condition
 * worsening), which is why this returns the lines rather than just a number.
 */
export function resolveLedger(opts: LedgerOptions, t: Tuning = TUNING): LedgerResult {
  const cap = t.economy.max_lines;
  if (opts.lines.length > cap) {
    throw new Error(`the ledger is ${cap} lines; refusing ${opts.lines.length}`);
  }
  const owed = opts.lines.reduce((a, l) => a + l.cost, 0);
  const prior = opts.priorBalance ?? 0;
  const available = opts.income + prior;

  // pay in declaration order until the money runs out
  let spent = 0;
  const unpaid: LedgerLine[] = [];
  for (const line of opts.lines) {
    if (spent + line.cost <= available) spent += line.cost;
    else unpaid.push(line);
  }

  const raw = opts.income + prior - owed;
  const floor = t.economy.debt_floor;
  const balance = Math.max(floor, raw);
  const atFloor = balance <= floor && raw <= floor;

  return {
    income: opts.income,
    owed,
    delta: raw - prior,
    balance,
    unpaid,
    atFloor,
    summary: summarise(opts.income, owed, unpaid, balance),
  };
}

function summarise(income: number, owed: number, unpaid: LedgerLine[], balance: number): string {
  if (unpaid.length === 0) {
    return balance > 20
      ? `The rent is paid and there is money left. That is not the same as safe.`
      : `The rent is paid. Nothing else is.`;
  }
  const which = unpaid.map((u) => u.label.toLowerCase()).join(' and ');
  void income;
  void owed;
  return `The ${which} did not get paid tonight.`;
}

/**
 * Whether a rank may be promoted (`SYS-ECON-01` §3): enough standing, no recent reviews, and
 * one favourable audit. The economy owns the rule; the briefing owns the ceremony.
 */
export function mayPromote(
  opts: { standing: number; tier: number; reviewsInLast3: number; favourableAudit: boolean },
  t: Tuning = TUNING,
): boolean {
  const threshold = t.economy.promotion_thresholds[Math.min(4, Math.max(0, opts.tier - 1))]!;
  return opts.standing >= threshold && opts.reviewsInLast3 === 0 && opts.favourableAudit;
}

/**
 * What the Warden's pay does to the sector's supply, which is the missing input the campaign
 * runner found (temperature's `supply_deficit` term never moved).
 *
 * A wage that covers rent means a household eats; a wage that does not means the block
 * notices. This is the *only* channel from the personal economy to the district, and it is
 * deliberately small — the design's claim is that the job costs rent, not that the whole
 * district runs on the Warden's purse.
 */
export function supplyPressure(result: LedgerResult): number {
  const shortfall = result.unpaid.reduce((a, l) => a + l.cost, 0);
  if (shortfall === 0) return -0.02; // paid: the street is fractionally calmer
  // The old divisor was 600, when the bill was 67. With the bill ~12, a shortfall of 3
  // is a quarter of the family's survival, not a rounding error.
  return Math.min(0.12, shortfall / 40);
}
