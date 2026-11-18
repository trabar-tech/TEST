import { describe, expect, it } from 'vitest';
import { World } from '@core/world';

describe('World', () => {
  it('creates entities with stable increasing ids', () => {
    const w = new World();
    const a = w.create('pawn');
    const b = w.create('pawn');
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
  });

  it('iterates in id order regardless of insertion order', () => {
    const w = new World();
    const a = w.create('x');
    const b = w.create('x');
    w.remove(a.id);
    const c = w.create('x');
    expect(w.all().map((e) => e.id)).toEqual([b.id, c.id]);
  });

  it('filters by kind and by component', () => {
    const w = new World();
    w.create('pawn', { pos: { x: 0, y: 0 } });
    w.create('pawn', { pos: { x: 1, y: 1 }, routine: [] });
    w.create('door', { door: { state: 'locked' } });
    expect(w.ofKind('pawn')).toHaveLength(2);
    expect(w.with('pos')).toHaveLength(2);
    expect(w.with('pos', 'routine')).toHaveLength(1);
  });

  it('removes entities', () => {
    const w = new World();
    const e = w.create('x');
    expect(w.has(e.id)).toBe(true);
    expect(w.remove(e.id)).toBe(true);
    expect(w.has(e.id)).toBe(false);
    expect(w.remove(e.id)).toBe(false);
  });

  it('snapshots and restores exactly (including nextId)', () => {
    const w = new World();
    w.create('pawn', { pos: { x: 3, y: 4 } });
    w.create('door', { door: { state: 'open' } });
    const snap = w.snapshot();
    const w2 = new World();
    w2.restore(snap);
    expect(w2.snapshot()).toEqual(snap);
    // next ids match, so a continued run is identical
    expect(w2.create('x').id).toBe(w.create('x').id);
  });

  it('does not alias component objects between worlds', () => {
    const w = new World();
    const e = w.create('pawn', { pos: { x: 0, y: 0 } });
    (e.c.pos as { x: number }).x = 5;
    const w2 = new World();
    w2.restore(w.snapshot());
    ((w2.get(e.id)!.c.pos) as { x: number }).x = 9;
    expect((w.get(e.id)!.c.pos as { x: number }).x).toBe(5);
  });
});
