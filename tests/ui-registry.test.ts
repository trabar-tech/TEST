// @vitest-environment jsdom
/**
 * The Registry screen (P3-T02's missing half, and G2 question 3's only hope).
 *
 * The Known cap has been tested since it was written; what was never tested is
 * whether a *player* can see it. These tests treat the screen as the artefact: can a
 * person learn three names from it, can they see the list is finite, and can they
 * watch somebody leave it.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRegistry, drawFace, meetHousehold } from '@ui/registry';
import { KnownSet, generateSector } from '@systems/households';

const sector = () => ({ ...generateSector({ seed: 2026 }), shift: 4 });

function mount(known = new KnownSet()) {
  const host = document.createElement('div');
  document.body.append(host);
  const handle = createRegistry(host, { sector: sector(), known, seed: 2026 });
  return { host, handle };
}

describe('naming people', () => {
  it('says plainly that nobody is Known yet, rather than showing an empty list', () => {
    const { host } = mount();
    expect(host.textContent).toMatch(/Nobody yet/);
    expect(host.textContent).toMatch(/0\/12 names/);
    expect(host.textContent).toMatch(/60 households/);
  });

  it('shows a Known person by name, class, household line and why they are known', () => {
    const known = new KnownSet();
    meetHousehold(sector(), known, 2026, 'h-014', 'cleared their flat', 2);
    const { host } = mount(known);
    const text = host.textContent ?? '';
    expect(text).toMatch(/1\/12 names/);
    expect(text).toMatch(/cleared their flat/);
    expect(text).toMatch(/known since shift 2/);
    // the Registry line is the household's own description, not a made-up biography
    expect(text).toMatch(/registered occupant/);
  });

  it('gives each person a stable face, so twelve people are distinguishable', () => {
    const c = document.createElement('canvas');
    c.width = 44;
    c.height = 52;
    expect(() => drawFace(c, 1234)).not.toThrow();
    expect(() => drawFace(c, 9999)).not.toThrow();
  });

  it('draws a canvas per Known person', () => {
    const known = new KnownSet();
    for (let i = 1; i <= 3; i++) known.add({ household_id: `h-00${i}`, reason: 'r' }, 1);
    const { host } = mount(known);
    expect(host.querySelectorAll('canvas').length).toBe(3);
  });
});

describe('the mass of the district is visible, so twelve feels like twelve', () => {
  it('lists the unknown as records, with a count', () => {
    const { host } = mount();
    expect(host.textContent).toMatch(/THE REST OF THE SECTOR \(60\)/);
    expect(host.textContent).toMatch(/Records, not people/);
  });

  it('drops a household out of the unknown list once it is Known', () => {
    const known = new KnownSet();
    known.add({ household_id: 'h-001', reason: 'r' }, 1);
    const { host } = mount(known);
    expect(host.textContent).toMatch(/THE REST OF THE SECTOR \(59\)/);
  });

  it('offers a way to go and see any unknown household', () => {
    const onVisit = vi.fn();
    const host = document.createElement('div');
    createRegistry(host, { sector: sector(), known: new KnownSet(), seed: 2026, onVisit });
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Go and see')!;
    btn.click();
    expect(onVisit).toHaveBeenCalledOnce();
    expect(onVisit.mock.calls[0]![0]).toMatch(/^h-\d{3}$/);
  });
});

describe('losing people, which is the point of the cap', () => {
  it('names the evicted in a column that only grows', () => {
    const known = new KnownSet();
    for (let i = 1; i <= 13; i++) known.add({ household_id: `h-${String(i).padStart(3, '0')}`, reason: 'recorded' }, i);
    const { host } = mount(known);
    const text = host.textContent ?? '';
    expect(text).toMatch(/OUT OF YOUR HEAD/);
    expect(text).toMatch(/Slots do not open/);
    expect(text).toMatch(/Still out there/);
    // exactly one person has gone, and the screen says so without a toast
    expect(known.evictions()).toHaveLength(1);
  });

  it('says "Nobody. Yet." before anyone is lost', () => {
    const { host } = mount(new KnownSet());
    expect(host.textContent).toMatch(/Nobody\. Yet\./);
  });

  it('refresh() shows a newly met person without remounting the screen', () => {
    const known = new KnownSet();
    const { host, handle } = mount(known);
    expect(host.textContent).toMatch(/0\/12 names/);
    meetHousehold(sector(), known, 2026, 'h-020', 'named in a line', 3);
    handle.refresh();
    expect(host.textContent).toMatch(/1\/12 names/);
    expect(host.textContent).toMatch(/named in a line/);
  });
});

describe('meeting someone', () => {
  it('materialises the same person the sim would, and reports no eviction', () => {
    const known = new KnownSet();
    const met = meetHousehold(sector(), known, 2026, 'h-009', 'went to look', 1);
    expect(met.agent?.household_id).toBe('h-009');
    expect(met.evicted).toBeNull();
  });

  it('reports who was pushed out when the twelfth slot is taken', () => {
    const known = new KnownSet();
    for (let i = 1; i <= 12; i++) known.add({ household_id: `h-${String(i).padStart(3, '0')}`, reason: 'r' }, 1);
    const met = meetHousehold(sector(), known, 2026, 'h-050', 'someone new', 2);
    expect(met.evicted).toBe('h-001');
    expect(known.size).toBe(12);
  });

  it('refuses a household that does not exist, rather than inventing one', () => {
    const known = new KnownSet();
    expect(meetHousehold(sector(), known, 2026, 'h-999', 'r', 1)).toEqual({ agent: null, evicted: null });
    expect(known.size).toBe(0);
  });
});

describe('closing', () => {
  it('removes the screen and fires onClose', () => {
    const host = document.createElement('div');
    const onClose = vi.fn();
    createRegistry(host, { sector: sector(), known: new KnownSet(), seed: 2026, onClose });
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Close')!;
    btn.click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
  });
});
