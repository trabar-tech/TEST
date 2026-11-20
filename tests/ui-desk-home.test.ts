// @vitest-environment jsdom
/**
 * The household edge, on the desk (P3-T02).
 *
 * The interesting decision in the desk is not "what classification do I write" — it
 * is "do I write a line that names this household?". That question is only askable if
 * the household is in front of the player while they decide, which is what this covers.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileMap } from '@core/nav';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Simulation, type CitizenFile, type MapJsonSlice } from '@systems/shift';
import { generateSector } from '@systems/households';
import { createDesk } from '@ui/desk';

const mapJson = JSON.parse(
  readFileSync(join(process.cwd(), 'content/maps/kiln_row_slice.json'), 'utf8'),
) as MapJson & MapJsonSlice;
const citizensJson = JSON.parse(
  readFileSync(join(process.cwd(), 'content/examples/citizens.slice.json'), 'utf8'),
) as CitizenFile;

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  document.body.innerHTML = '';
});

function deskWithSector() {
  const sim = new Simulation({
    seed: 2026,
    shift: 1,
    map: new TileMap(mapJsonToDef(mapJson)),
    mapJson,
    citizens: citizensJson,
    sector: generateSector({ seed: 2026 }),
  });
  sim.beginBeat();
  sim.openInspection('c-0221');
  sim.resolveInspection('P');
  sim.openDesk();
  const desk = createDesk(sim, host, { onSubmit: () => {} });
  return { sim, desk };
}

describe('the desk shows where the person lives', () => {
  it('names the household beside the evidence, before the signature', () => {
    const { desk } = deskWithSector();
    expect(host.textContent).toMatch(/THE HOUSEHOLD/);
    expect(host.textContent).toMatch(/class [A-D]/);
    expect(host.textContent).toMatch(/occupant/);
    desk.destroy();
  });

  it('shows the household id, so the Registry and the desk can be cross-read', () => {
    const { sim, desk } = deskWithSector();
    const home = sim.homeOf('c-0221')!;
    expect(host.textContent).toMatch(new RegExp(home.household_id));
    desk.destroy();
  });

  it('says nothing about a household when the street is not bound to the district', () => {
    const sim = new Simulation({
      seed: 1,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
    });
    sim.beginBeat();
    sim.openInspection('c-0221');
    sim.resolveInspection('P');
    sim.openDesk();
    const desk = createDesk(sim, host, { onSubmit: () => {} });
    expect(host.textContent).not.toMatch(/THE HOUSEHOLD/);
    desk.destroy();
  });

  it('flags a real discrepancy between the card and the record as a line worth writing', () => {
    const sector = generateSector({ seed: 2026 });
    const home = (() => {
      const probe = new Simulation({
        seed: 2026,
        shift: 1,
        map: new TileMap(mapJsonToDef(mapJson)),
        mapJson,
        citizens: citizensJson,
        sector,
      });
      return probe.homeOf('c-0221')!;
    })();

    // force a disagreement into the district the sim will read
    const altered = {
      ...sector,
      households: sector.households.map((h) =>
        h.id === home.household_id ? { ...h, ration_class: 'D' as const, members: 5 } : h,
      ),
    };
    const sim = new Simulation({
      seed: 2026,
      shift: 1,
      map: new TileMap(mapJsonToDef(mapJson)),
      mapJson,
      citizens: citizensJson,
      sector: altered,
    });
    sim.beginBeat();
    sim.openInspection('c-0221');
    sim.resolveInspection('P');
    sim.openDesk();
    const desk = createDesk(sim, host, { onSubmit: () => {} });
    // c-0221 carries class C, the household is registered D and crowded
    expect(host.textContent).toMatch(/the card and the record disagree|people on a class D card/);
    desk.destroy();
  });
});
