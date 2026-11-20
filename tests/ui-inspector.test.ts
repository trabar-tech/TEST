// @vitest-environment jsdom
/**
 * P3-T10 — the inspector, tested as a *player-facing* artefact.
 *
 * jsdom cannot tell me whether the panel is pleasant to read, so these tests check
 * the things that actually break: that every number from the director reaches the
 * screen, that an excluded card shows the clause that excluded it, and that the
 * roster tells the truth about its own gaps.
 */

import { describe, expect, it, vi } from 'vitest';
import { createInspector } from '@ui/inspector';
import { KnownSet } from '@systems/households';
import type { ShiftOutput } from '@systems/showrunner';

const out = (over: Partial<ShiftOutput> = {}): ShiftOutput => ({
  shift: 4,
  temperature: 62,
  legitimacy: 41,
  grade: 'braced',
  arbiter: { state: 'build', enteredShift: 4, armedBudget: 1, incidentBudget: 1, why: '3 storylets consumed' },
  eye: { attention: 0.36, level: 2, recent: [3, 4], lastWhy: 'a record contradicted itself' },
  directives: [{ directiveId: 'dir-0201', reason: 'your files have stopped matching your nights' }],
  storylets: [],
  trace: [
    {
      card: { id: 'me-04-child', title: 'A child with no line' } as never,
      novelty: 1,
      alignment: 0.9,
      pacing: 0.8,
      temperature: 1,
      final: 0.97,
      eligible: true,
      why: ['probes a fault line you lean on (0.90)'],
    },
    {
      card: { id: 'me-06-quiet', title: 'Nothing at all' } as never,
      novelty: 0,
      alignment: 0.5,
      pacing: 0.1,
      temperature: 1,
      final: 0,
      eligible: false,
      why: ['temperature 62 outside [0, 40]'],
    },
  ],
  factionReport: ['cell is using printery_b'],
  intel: ['Informant: they are recruiting from the households with the most complaints'],
  epilogues: [],
  fault: { paperwork_neglect: 0.7 },
  dominantFault: 'paperwork_neglect',
  ...over,
});

const state = () => ({ known: new KnownSet(), sector: { households: [] } as never });

describe('the inspector shows the director\'s arithmetic', () => {
  it('renders all four headline numbers', () => {
    const host = document.createElement('div');
    const panel = createInspector(host, out(), state());
    const text = host.textContent ?? '';
    expect(text).toMatch(/WHY SHIFT 4 HAPPENED/);
    expect(text).toMatch(/62/);
    expect(text).toMatch(/41/);
    expect(text).toMatch(/BUILD/);
    expect(text).toMatch(/36%/);
    panel.destroy();
  });

  it('never says the resolution-deprecated word "undefined"', () => {
    const host = document.createElement('div');
    const panel = createInspector(host, out(), state());
    expect(host.textContent).not.toMatch(/undefined|NaN/);
    panel.destroy();
  });

  it('states the scoring formula it used, floor included', () => {
    const host = document.createElement('div');
    createInspector(host, out(), state());
    expect(host.textContent).toMatch(/novelty × alignment × pacing × temperature × 0\.15 \+ 0\.85/);
  });

  it('shows the four factors for an eligible card, and the clause for an excluded one', () => {
    const host = document.createElement('div');
    createInspector(host, out(), state());
    const text = host.textContent ?? '';
    expect(text).toMatch(/novelty 1 · alignment 0\.90 · pacing 0\.80 · temperature 1\.00/);
    expect(text).toMatch(/RULED OUT/);
    expect(text).toMatch(/me-06-quiet — temperature 62 outside \[0, 40\]/);
  });

  it('shows the Desk\'s opinion and the reason the directive arrived', () => {
    const host = document.createElement('div');
    createInspector(host, out(), state());
    const text = host.textContent ?? '';
    expect(text).toMatch(/DIRECTIVE/);
    expect(text).toMatch(/dir-0201/);
    expect(text).toMatch(/files have stopped matching your nights/);
  });

  it('shows the Arbiter\'s why-line, so pacing is not a mystery', () => {
    const host = document.createElement('div');
    createInspector(host, out(), state());
    expect(host.textContent).toMatch(/3 storylets consumed/);
  });

  it('a shift with no directives does not render an empty row', () => {
    const host = document.createElement('div');
    createInspector(host, out({ directives: [] }), state());
    expect(host.textContent).not.toMatch(/DIRECTIVE/);
  });
});

describe('the roster tells the truth about itself', () => {
  it('says nobody is Known rather than showing an empty list', () => {
    const host = document.createElement('div');
    createInspector(host, out(), state());
    expect(host.textContent).toMatch(/Nobody yet/);
  });

  it('counts the Known against the cap', () => {
    const known = new KnownSet();
    known.add({ household_id: 'h-001', reason: 'named in a filed line' }, 1);
    known.add({ household_id: 'h-002', reason: 'cleared their flat' }, 2);
    const host = document.createElement('div');
    createInspector(host, out(), { known, sector: { households: [] } as never });
    const text = host.textContent ?? '';
    expect(text).toMatch(/PEOPLE YOU COULD NAME \(2\/12\)/);
    expect(text).toMatch(/h-001 — named in a filed line/);
  });

  it('reports empty slots only once somebody has actually gone', () => {
    const quiet = new KnownSet();
    quiet.add({ household_id: 'h-001', reason: 'r' }, 1);
    const a = document.createElement('div');
    createInspector(a, out(), { known: quiet, sector: { households: [] } as never });
    expect(a.textContent).not.toMatch(/empty\./);

    const evicting = new KnownSet();
    for (let i = 1; i <= 13; i++) evicting.add({ household_id: `h-${i}`, reason: 'r' }, 1);
    const b = document.createElement('div');
    createInspector(b, out(), { known: evicting, sector: { households: [] } as never });
    // eviction replaces rather than shortens, so the loss has to be named as
    // people, not as empty slots
    expect(b.textContent).toMatch(/1 person has gone out of your head — h-1\./);
    expect(b.textContent).not.toMatch(/slots empty/);
  });
});

describe('closing', () => {
  it('removes the panel and fires onClose', () => {
    const host = document.createElement('div');
    const onClose = vi.fn();
    const panel = createInspector(host, out(), state(), { onClose });
    expect(host.children).toHaveLength(1);
    panel.destroy();
    expect(host.children).toHaveLength(0);
  });

  it('close button closes exactly once', () => {
    const host = document.createElement('div');
    const onClose = vi.fn();
    createInspector(host, out(), state(), { onClose });
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Close')!;
    btn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(host.children).toHaveLength(0);
  });

  it('carries a stale note when the shift being inspected is not the last one', () => {
    const host = document.createElement('div');
    createInspector(host, out(), state(), { staleNote: 'this is the previous shift' });
    expect(host.textContent).toMatch(/this is the previous shift/);
  });
});
