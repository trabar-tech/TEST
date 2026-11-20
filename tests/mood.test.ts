/**
 * P3-T03 — the district's mood reaches the street.
 *
 * The temperature formula was tested in `households.test.ts`, which proves the maths
 * and not that anybody hears it. This is the seam: the grade the street announces
 * and the grade the campaign computes must be the *same vocabulary*, or the game is
 * telling two stories about the same day.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Barks, type BarkSet } from '@systems/barks';
import { describeStreet, gradeFromPressure, streetGrade } from '@systems/mood';
import { recordForce, readSector, nextShift } from '@systems/sector';
import { grade as campaignGrade, type SectorState } from '@systems/households';
import { emptyState } from '@core/state';
import { streamFor } from '@core/rng';

const barks = JSON.parse(readFileSync(join(process.cwd(), 'content/examples/barks.json'), 'utf8')) as BarkSet;

describe('the street reads the saved sector, not a local variable', () => {
  it('opens calm', () => {
    const state = emptyState(1);
    expect(streetGrade(state)).toBe('calm');
    expect(describeStreet(state)).toMatch(/ordinary/);
  });

  it('roughens as the force index ratchets', () => {
    const state = emptyState(1);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      recordForce(state, 9);
      seen.add(streetGrade(state));
      expect(readSector(state).force).toBeGreaterThan(0);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect([...seen]).toContain('hostile');
  });

  it('survives a shift turn, because the memory is in `flags` and not in `main.ts`', () => {
    const state = emptyState(1);
    recordForce(state, 9);
    const before = streetGrade(state);
    nextShift(state);
    // one shift of decay is not enough to erase a hard night
    expect(streetGrade(state)).toBe(before);
  });

  it('grades coarsely, in four words a person could use', () => {
    expect(gradeFromPressure(0)).toBe('calm');
    expect(gradeFromPressure(0.3)).toBe('wary');
    expect(gradeFromPressure(0.6)).toBe('braced');
    expect(gradeFromPressure(0.95)).toBe('hostile');
  });

  it('uses the same four words as the campaign temperature', () => {
    const state = emptyState(1);
    const street = streetGrade(state);
    const campaign = campaignGrade({
      id: 'kiln_row',
      shift: 0,
      households: [],
      force_index: 0,
      supply_deficit: 0,
      faction_heat: 0,
    } as SectorState);
    expect(typeof street).toBe(typeof campaign);
    expect(['calm', 'wary', 'braced', 'hostile']).toContain(street);
    expect(['calm', 'wary', 'braced', 'hostile']).toContain(campaign);
  });

  it('explains itself in a clause, without a number', () => {
    const state = emptyState(1);
    for (const line of [describeStreet(state)]) {
      expect(line).not.toMatch(/\d+(\.\d+)?%/);
      expect(line.length).toBeGreaterThan(10);
    }
  });
});

describe('the loudspeaker says different things on different days', () => {
  it('the shipped bark file has lines for every grade the street can reach', () => {
    for (const g of ['calm', 'wary', 'braced', 'hostile'] as const) {
      expect(barks.by_grade?.[g]?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it('never repeats a graded line until it has used them all', () => {
    const b = new Barks(barks, 4, 1);
    const calm = barks.by_grade!.calm!;
    const said = new Set<string>();
    for (let i = 0; i < calm.length; i++) {
      const line = b.forGrade('calm')!;
      expect(said.has(line)).toBe(false);
      said.add(line);
    }
    expect(said.size).toBe(calm.length);
  });

  it('falls back to plain ambience rather than silence when a grade is unwritten', () => {
    const thin: BarkSet = { ...barks, by_grade: { hostile: ['The street is waiting.'] } };
    const b = new Barks(thin, 1, 1);
    expect(b.forGrade('calm')).toBeTruthy();
    expect(barks.ambient).toContain(b.forGrade('calm'));
  });

  it('a bark file with no graded lines at all still works', () => {
    const plain: BarkSet = { ...barks };
    delete plain.by_grade;
    const b = new Barks(plain, 1, 1);
    expect(b.forGrade('braced')).toBeTruthy();
  });

  it('is deterministic for a shift, like everything else', () => {
    const run = () => {
      const b = new Barks(barks, 12, 3);
      return [b.forGrade('wary'), b.forGrade('wary'), b.forGrade('braced')];
    };
    expect(run()).toEqual(run());
  });

  it('the mood lines are not interchangeable with the ordinary ones', () => {
    // if a graded line also appears in `ambient`, the grade is decoration
    for (const g of ['calm', 'wary', 'braced', 'hostile'] as const) {
      for (const line of barks.by_grade?.[g] ?? []) {
        expect(barks.ambient).not.toContain(line);
      }
    }
  });

  it('the rng stream is separate from the ambient one, so adding moods did not reseed the street', () => {
    const a = new Barks(barks, 99, 2).next(0)?.text;
    const b = new Barks(barks, 99, 2).next(0)?.text;
    expect(a).toBe(b);
    expect(streamFor(99, 2, 'barks').next()).toBe(streamFor(99, 2, 'barks').next());
  });
});
