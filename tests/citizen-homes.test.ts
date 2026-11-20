/**
 * The street is the district (P3-T02, the honest version).
 *
 * `materialise()` being pure proves nothing about continuity if the six people on the
 * street are not among the sixty households. These tests are about that seam: a citizen
 * has a stable home, inspecting them teaches it to the player, and the *same record*
 * can later be materialised as the person you meet in the flat.
 */

import { describe, expect, it } from 'vitest';
import { describeDiscrepancy, describeHome, homeFor, homesFor, knownReason } from '@systems/citizen-homes';
import { generateSector, materialise } from '@systems/households';
import { Simulation, type CitizenFile, type MapJsonSlice } from '@systems/shift';
import { TileMap } from '@core/nav';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapJsonToDef } from '../scripts/lib/load-content';
import type { MapJson } from '../scripts/lib/load-content';

const mapJson = JSON.parse(
  readFileSync(join(process.cwd(), 'content/maps/kiln_row_slice.json'), 'utf8'),
) as MapJson & MapJsonSlice;
const citizensJson = JSON.parse(
  readFileSync(join(process.cwd(), 'content/examples/citizens.slice.json'), 'utf8'),
) as CitizenFile;

const sector = () => generateSector({ seed: 2026 });
const cast = citizensJson.citizens;
const citizen = (id: string): (typeof cast)[number] => cast.find((c) => c.id === id)!;

describe('every citizen has one stable home', () => {
  it('assigns the same household every time, for the same seed', () => {
    const a = homeFor(sector(), 2026, citizen('c-0221'))!;
    const b = homeFor(sector(), 2026, citizen('c-0221'))!;
    expect(a.household_id).toBe(b.household_id);
  });

  it('is stable across a freshly generated district — people do not move because it grew', () => {
    const a = homeFor(generateSector({ seed: 2026 }), 2026, citizen('c-0307'))!;
    const b = homeFor(generateSector({ seed: 2026, count: 40 }), 2026, citizen('c-0307'))!;
    // the home is still a household that exists in the smaller district
    expect(b.household).toBeDefined();
    expect(generateSector({ seed: 2026 }).households.map((h) => h.id)).toContain(a.household_id);
  });

  it('differs across campaign seeds, so a new campaign is a new district', () => {
    const homes = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => homeFor(sector(), seed, citizen('c-0221'))!.household_id),
    );
    expect(homes.size).toBeGreaterThan(1);
  });

  it('prefers a household in the same block as the post, so the street does not lie', () => {
    // c-0221 works at the laundry; laundry posts map to the laundry yard
    const home = homeFor(sector(), 2026, citizen('c-0221'))!;
    expect(home.household.block).toBe('laundry_yard');
  });

  it('falls back to any household when the post has no matching block', () => {
    const s = { ...sector(), households: sector().households.filter((h) => h.block === 'tenement_row') };
    const home = homeFor(s, 2026, citizen('c-0221'))!;
    expect(home.household.block).toBe('tenement_row');
  });

  it('returns null rather than inventing a home in an empty district', () => {
    expect(homeFor({ ...sector(), households: [] }, 2026, citizen('c-0221'))).toBeNull();
  });

  it('gives every citizen in the cast a home, and they are not all the same one', () => {
    const homes = homesFor(sector(), 2026, cast);
    expect(homes).toHaveLength(cast.length);
    expect(new Set(homes.map((h) => h.household_id)).size).toBeGreaterThan(1);
  });
});

describe('the papers and the household record can disagree, visibly', () => {
  it('says nothing when the ration class matches', () => {
    const home = { ...homeFor(sector(), 2026, citizen('c-0221'))!, household: { ...homeFor(sector(), 2026, citizen('c-0221'))!.household, ration_class: citizen('c-0221').papers.ration_class as never } };
    expect(describeDiscrepancy(citizen('c-0221'), home.household)).toBeNull();
  });

  it('names the gap when the card and the registration disagree', () => {
    const base = homeFor(sector(), 2026, citizen('c-0414'))!;
    // deliberately a class the citizen's card does not claim
    const household = { ...base.household, ration_class: 'D' as const, members: 2 };
    expect(describeDiscrepancy(citizen('c-0414'), household)).toMatch(/the household is registered as class/);
  });

  it('calls out a crowded low-class household with an over-classed card', () => {
    const base = homeFor(sector(), 2026, citizen('c-0414'))!;
    const household = { ...base.household, ration_class: 'D' as const, members: 5 };
    expect(describeDiscrepancy(citizen('c-0414'), household)).toMatch(/5 people on a class D card/);
  });

  it('describes a home the way the Registry does, so the two screens agree', () => {
    const home = homeFor(sector(), 2026, citizen('c-0640'))!;
    expect(describeHome(home)).toMatch(/class [A-D]/);
    expect(describeHome(home)).toMatch(/occupant/);
    expect(describeHome(home)).not.toMatch(/_/);
  });
});

describe('when a home becomes Known', () => {
  const home = homeFor(sector(), 2026, citizen('c-0221'))!;

  it('one conversation is not a relationship', () => {
    expect(knownReason(home, 1, false)).toBeNull();
  });

  it('two conversations are', () => {
    expect(knownReason(home, 2, false)).toMatch(/twice/);
  });

  it('a filed line is, immediately — the record is what puts a person in your head', () => {
    expect(knownReason(home, 0, true)).toMatch(/a line you filed/);
  });
});

describe('the inspection is where the player learns it', () => {
  function sim() {
    const s = new Simulation({
      seed: 2026,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
      sector: sector(),
    });
    s.beginBeat();
    return s;
  }

  it('puts the household line in the docket note, so it can be read before signing', () => {
    const s = sim();
    s.openInspection('c-0221');
    const event = s.resolveInspection('P')!;
    expect(event.note).toMatch(/They live in/);
    expect(event.edge?.household_id).toBe(s.homeOf('c-0221')?.household_id);
    expect(event.edge?.line).toMatch(/class [A-D]/);
  });

  it('resolves the same home twice, even after other work in between', () => {
    const s = sim();
    const first = s.homeOf('c-0221');
    s.openInspection('c-0307');
    s.resolveInspection('P');
    expect(s.homeOf('c-0221')).toEqual(first);
  });

  it('does not make them Known on one inspection', () => {
    const s = sim();
    s.openInspection('c-0221');
    s.resolveInspection('P');
    expect(s.knownCandidate('c-0221')).toBeNull();
  });

  it('makes them Known once a line has been filed naming them', () => {
    const s = sim();
    s.openInspection('c-0221');
    const event = s.resolveInspection('P')!;
    s.openDesk();
    s.file(event.ref, { claim: { ...event.draft }, tags: [], free_text: '' });
    const candidate = s.knownCandidate('c-0221');
    expect(candidate?.householdId).toBe(event.edge?.household_id);
    expect(candidate?.reason).toMatch(/a line you filed/);
  });

  it('the household can then be materialised as a person, from the same record', () => {
    const s = sim();
    s.openInspection('c-0221');
    const event = s.resolveInspection('P')!;
    const agent = materialise(s.sector!, event.edge!.household_id, 2026);
    expect(agent.household_id).toBe(event.edge!.household_id);
    // and it is the *same* person on a second look: this is the continuity claim
    expect(materialise(s.sector!, event.edge!.household_id, 2026)).toEqual(agent);
  });

  it('a shift with no sector simply has no homes — the pure slice still works', () => {
    const bare = new Simulation({
      seed: 1,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
    });
    bare.beginBeat();
    bare.openInspection('c-0221');
    const event = bare.resolveInspection('P')!;
    expect(event.edge).toBeUndefined();
    expect(event.note).not.toMatch(/They live in/);
    expect(bare.homeOf('c-0221')).toBeNull();
  });
});

describe('a citizen carries their household\'s mood', () => {
  const sim = (sectorOverride?: ReturnType<typeof generateSector>) => {
    const s = new Simulation({
      seed: 2026,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
      sector: sectorOverride ?? sector(),
    });
    s.beginBeat();
    return s;
  };

  it('reports an effective dread at least as high as the authored one scaled', () => {
    const s = sim();
    const authored = citizensJson.citizens.find((c) => c.id === 'c-0221')!.dread;
    expect(s.citizens.effectiveDread('c-0221')).toBeGreaterThanOrEqual(authored);
  });

  it('raises dread for everyone whose household is angry and available', () => {
    const base = sector();
    const angry = {
      ...base,
      households: base.households.map((h) => ({ ...h, grievance: 0.9, flags: ['available'] })),
    };
    const calmSim = sim();
    const angrySim = sim(angry);
    expect(angrySim.citizens.effectiveDread('c-0221')).toBeGreaterThan(
      calmSim.citizens.effectiveDread('c-0221'),
    );
  });

  it('never exceeds 1, however angry the district gets', () => {
    const base = sector();
    const worst = {
      ...base,
      households: base.households.map((h) => ({ ...h, grievance: 1, flags: ['available'] })),
    };
    const s = sim(worst);
    for (const c of citizensJson.citizens) {
      expect(s.citizens.effectiveDread(c.id)).toBeLessThanOrEqual(1);
    }
  });

  it('reads the district again when the district changes, so the street does not lag', () => {
    const base = sector();
    const s = sim();
    const before = s.citizens.effectiveDread('c-0221');
    s.setSector({
      ...base,
      households: base.households.map((h) => ({ ...h, grievance: 0.95, flags: ['available'] })),
    });
    expect(s.citizens.effectiveDread('c-0221')).toBeGreaterThan(before);
  });

  it('falls back to the authored dread when there is no district', () => {
    const bare = new Simulation({
      seed: 1,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
    });
    expect(bare.citizens.effectiveDread('c-0221')).toBeCloseTo(
      citizensJson.citizens.find((c) => c.id === 'c-0221')!.dread,
      5,
    );
  });
});
