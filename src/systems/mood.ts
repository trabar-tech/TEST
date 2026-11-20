/**
 * The district's weather, for the street level (P3-T03).
 *
 * Phase 3 computes a temperature for the campaign layer, from households, force and
 * supply. The Phase 1 street already knows some of that on its own: the tactical
 * force index persists on `GameState.flags` (`sector.ts`), and the Warden's own
 * behaviour is visible in it.
 *
 * This module bridges the two without letting the street import the campaign or the
 * campaign import the street: it takes the *published* sector memory and returns a
 * grade and a sentence. Same vocabulary as `households.grade()` so the loudspeaker
 * and the inspector can never disagree about what kind of day it is.
 *
 * Nothing here reads `truth`.
 */

import { readSector } from './sector';
import { pressureFromIndex } from './tactical/force';
import type { GameState } from '@core/state';
import type { Grade } from './barks';

export type { Grade };

/** Pressure bands, as words. Deliberately coarse: four is what a person can hear. */
export function gradeFromPressure(pressure: number): Grade {
  if (pressure < 0.25) return 'calm';
  if (pressure < 0.5) return 'wary';
  if (pressure < 0.78) return 'braced';
  return 'hostile';
}

/**
 * The street's grade for this shift. Reads the *saved* sector memory, not a local
 * variable, so a reload cannot quietly calm the district down.
 *
 * Forces dominate here on purpose: the campaign temperature also weighs supply and
 * faction heat, but a person standing on a street corner can only see how many
 * uniforms there are and how the doors are behaving.
 */
export function streetGrade(state: GameState): Grade {
  const memory = readSector(state);
  const pressure = pressureFromIndex({ sector: memory.sector, value: memory.force });
  return gradeFromPressure(pressure);
}

/** One clause the HUD can put next to the grade, if it ever needs to explain itself. */
export function describeStreet(state: GameState): string {
  const memory = readSector(state);
  const grade = streetGrade(state);
  const shifts = memory.shifts === 1 ? 'first shift' : `${memory.shifts} shifts`;
  switch (grade) {
    case 'calm':
      return `the street is ordinary (${shifts} of policing)`;
    case 'wary':
      return `the street is careful with you (${shifts} of policing)`;
    case 'braced':
      return `the street has stopped pretending (${shifts} of policing)`;
    case 'hostile':
      return `the street is waiting for you to leave (${shifts} of policing)`;
  }
}
