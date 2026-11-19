/**
 * P2-T05 / P2-T06 acceptance:
 *  - every rung 2+ produces exactly one line with the correct tool tag
 *  - rung 4 without authorisation is a Compliance Review, and the player is told
 *  - the force index ratchets across shifts
 */

import { describe, expect, it } from 'vitest';
import {
  AUTHORISATION_CALL_SECONDS,
  addForce,
  applyForce,
  applyPresence,
  decayForceIndex,
  isAuthorised,
  legitimacyCost,
  pressureFromIndex,
  requestAuthorisation,
  startingMood,
  startingRung,
  type Target,
} from '@systems/tactical/force';
import { RUNG_TOOL, type ForceRung } from '@systems/tactical/types';

const target = (over: Partial<Target> = {}): Target => ({
  id: 'h-01',
  compliance: 40,
  aggression: 2,
  wound: 'healthy',
  detained: false,
  stabilised: false,
  ...over,
});

describe('the force continuum', () => {
  it('presence alone raises compliance and costs nothing', () => {
    const t = applyPresence(target(), 5, true);
    expect(t.compliance).toBe(40 + 8 * 5);
    expect(applyPresence(target(), 5, false).compliance).toBe(40);
  });

  it('rung 2 raises compliance by 25 and makes the room angrier', () => {
    const out = applyForce(target(), { rung: 2, tool: 'hands', witnesses: 2, area: false }, { authorised: true });
    expect(out.target.compliance).toBe(65);
    expect(out.target.aggression).toBe(3);
    expect(out.needsLine).toBe(true);
    expect(out.logTag).toBe('control:hands');
    expect(out.forceWeight).toBe(1);
  });

  it('rung 3 is an area effect: gas drifts and hits bystanders', () => {
    const out = applyForce(target(), { rung: 3, tool: 'baton', witnesses: 4, area: true }, { authorised: true });
    expect(out.target.compliance).toBe(100);
    expect(out.collateral).toBe(1);
    expect(out.damage).toBe(1);
    expect(out.logTag).toBe('compliance:baton');
  });

  it('rung 4 drops the target and angers everyone who saw it', () => {
    const out = applyForce(target(), { rung: 4, tool: 'firearm', witnesses: 3, area: false }, { authorised: true });
    expect(out.target.wound).toBe('down');
    expect(out.witnessesRoused).toBe(3);
    expect(out.logTag).toBe('lethal:firearm');
    expect(out.forceWeight).toBe(6);
  });

  it('rung 5 ends the scene and costs the most legitimacy', () => {
    const out = applyForce(target(), { rung: 5, tool: 'collective_order', witnesses: 6, area: true }, { authorised: true });
    expect(out.target.wound).toBe('dead');
    expect(out.collateral).toBe(3);
    expect(out.logTag).toBe('collective:collective_order');
    expect(out.legitimacy).toBeLessThan(applyForce(target(), { rung: 4, tool: 'firearm', witnesses: 3, area: false }, { authorised: true }).legitimacy);
  });

  it('rung 1 writes no line at all, and every rung 2-5 writes exactly one', () => {
    for (const rung of [1, 2, 3, 4, 5] as ForceRung[]) {
      const out = applyForce(target(), { rung, tool: 'x', witnesses: 1, area: false }, { authorised: true });
      expect(out.needsLine, `rung ${rung}`).toBe(rung >= 2);
      expect(out.logTag, `rung ${rung}`).toBe(RUNG_TOOL[rung] === null ? null : `${tagFor(rung)}:x`);
    }
  });

  it('using rung 4 unauthorised is flagged and costs extra legitimacy', () => {
    const auth = applyForce(target(), { rung: 4, tool: 'firearm', witnesses: 1, area: false }, { authorised: true });
    const raw = applyForce(target(), { rung: 4, tool: 'firearm', witnesses: 1, area: false }, { authorised: false });
    expect(raw.legitimacy).toBeLessThan(auth.legitimacy);
    expect(raw.legitimacy).toBe(auth.legitimacy - 2);
  });

  it('shooting someone already down kills them, and is flagged as an execution', () => {
    // the mechanic is unavoidable; the *flag* is the design, because the audit can
    // prove intent from it and nothing else in the scene can
    const out = applyForce(target({ wound: 'down' }), { rung: 4, tool: 'firearm', witnesses: 0, area: false }, { authorised: true });
    expect(out.target.wound).toBe('dead');
    expect(out.execution).toBe(true);
    const clean = applyForce(target(), { rung: 4, tool: 'firearm', witnesses: 0, area: false }, { authorised: true });
    expect(clean.execution).toBe(false);
  });

  it('legitimacy cost is monotonic in rung', () => {
    const costs = ([1, 2, 3, 4, 5] as ForceRung[]).map(legitimacyCost);
    for (let i = 1; i < costs.length; i++) expect(costs[i]!).toBeGreaterThan(costs[i - 1]!);
  });
});

function tagFor(rung: ForceRung): string {
  return { 1: 'presence', 2: 'control', 3: 'compliance', 4: 'lethal', 5: 'collective' }[rung]!;
}

describe('field authorisation', () => {
  it('takes four seconds and then permits rung 4', () => {
    const auth = requestAuthorisation(4, 100);
    expect(auth.grantedAt).toBe(100 + AUTHORISATION_CALL_SECONDS);
    expect(isAuthorised(auth, 4, 103)).toBe(false);
    expect(isAuthorised(auth, 4, 104)).toBe(true);
    expect(isAuthorised(auth, 5, 104)).toBe(false);
  });

  it('no authorisation means no lethal force', () => {
    expect(isAuthorised(null, 4, 999)).toBe(false);
    // and rungs below the threshold never need one
    expect(isAuthorised(null, 3, 0)).toBe(true);
  });

  it('a denial is a denial, and it is in the log', () => {
    const denied = requestAuthorisation(4, 10, { alwaysDeny: true });
    expect(denied.denied).toBe(true);
    expect(denied.grantedAt).toBeNull();
    expect(isAuthorised(denied, 4, 999)).toBe(false);
  });
});

describe('the force ratchet', () => {
  it('decays 15% per shift', () => {
    expect(decayForceIndex({ sector: 'kiln_row', value: 10 }).value).toBe(8.5);
  });

  it('accumulates across a shift and raises next shift\'s temperature', () => {
    let index = { sector: 'kiln_row', value: 0 };
    for (let i = 0; i < 3; i++) index = addForce(index, 6);
    expect(index.value).toBe(18);
    expect(pressureFromIndex(index)).toBeCloseTo(0.9, 2);
    expect(startingRung(index)).toBe(3);
    expect(startingMood(index).aggression).toBeGreaterThan(startingMood({ sector: 'x', value: 0 }).aggression);
  });

  it('a quiet shift keeps the sector quiet', () => {
    const calm = addForce({ sector: 'x', value: 0 }, 2);
    expect(startingRung(calm)).toBe(1);
    expect(pressureFromIndex(calm)).toBeLessThan(0.2);
  });

  it('saturates rather than running away', () => {
    expect(pressureFromIndex({ sector: 'x', value: 400 })).toBe(1);
  });
});
