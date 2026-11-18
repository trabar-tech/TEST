import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@core/bus';

describe('EventBus', () => {
  it('delivers to matching subscribers only', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('inspection', a);
    bus.on('incident', b);
    bus.emit('inspection', { x: 1 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });

  it('delivers to wildcard subscribers', () => {
    const bus = new EventBus();
    const all = vi.fn();
    bus.on('*', all);
    bus.emit('a', 1);
    bus.emit('b', 2);
    expect(all).toHaveBeenCalledTimes(2);
  });

  it('assigns monotonic sequence numbers and carries the tick', () => {
    const bus = new EventBus();
    const meta: Array<{ seq: number; tick: number }> = [];
    bus.on('*', (_p, m) => meta.push({ seq: m.seq, tick: m.tick }));
    bus.emit('x', null, 10);
    bus.emit('y', null, 11);
    expect(meta).toEqual([
      { seq: 0, tick: 10 },
      { seq: 1, tick: 11 },
    ]);
  });

  it('supports unsubscribe', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('x', fn);
    bus.emit('x', 1);
    off();
    bus.emit('x', 2);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('supports once', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('x', fn);
    bus.emit('x', 1);
    bus.emit('x', 2);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('lets a handler unsubscribe during dispatch without skipping others', () => {
    const bus = new EventBus();
    const order: string[] = [];
    const offA = bus.on('x', () => {
      order.push('a');
      offA();
    });
    bus.on('x', () => order.push('b'));
    bus.emit('x', null);
    expect(order).toEqual(['a', 'b']);
  });

  it('keeps a bounded ring buffer', () => {
    const bus = new EventBus({ capacity: 3 });
    for (let i = 0; i < 10; i++) bus.emit('x', i);
    const tail = bus.tail(100);
    expect(tail).toHaveLength(3);
    expect(tail.map((e) => e.payload)).toEqual([7, 8, 9]);
  });

  it('filters the tail by type', () => {
    const bus = new EventBus();
    bus.emit('a', 1);
    bus.emit('b', 2);
    bus.emit('a', 3);
    expect(bus.tail(10, 'a').map((e) => e.payload)).toEqual([1, 3]);
  });

  it('can disable recording (production builds)', () => {
    const bus = new EventBus({ recording: false });
    bus.emit('x', 1);
    expect(bus.tail(10)).toHaveLength(0);
  });

  it('1000 events of 3 types are all retained and filterable', () => {
    const bus = new EventBus({ capacity: 2000 });
    const types = ['inspection', 'incident', 'patrol'];
    for (let i = 0; i < 1000; i++) bus.emit(types[i % 3]!, { i });
    expect(bus.tail(2000)).toHaveLength(1000);
    expect(bus.tail(2000, 'inspection')).toHaveLength(334);
    expect(bus.tail(2000, 'incident')).toHaveLength(333);
    expect(bus.tail(2000, 'patrol')).toHaveLength(333);
  });

  it('preserves ordering across a pause/unpause', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    bus.on('x', (p) => seen.push((p as { i: number }).i));
    bus.emit('x', { i: 1 });
    bus.emit('x', { i: 2 });
    bus.emit('x', { i: 3 });
    expect(seen).toEqual([1, 2, 3]);
    expect(bus.tail(3).map((e) => e.meta.seq)).toEqual([0, 1, 2]);
  });
});
