import { describe, expect, it } from 'vitest';
import { canonical, stateHash } from '@core/hash';

describe('canonical', () => {
  it('sorts object keys so key order never changes the hash', () => {
    expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }));
  });

  it('treats -0 and 0 as equal', () => {
    expect(canonical({ x: -0 })).toBe(canonical({ x: 0 }));
  });

  it('handles nested structures', () => {
    const a = { z: [1, { y: 2, x: 3 }], a: 'str' };
    const b = { a: 'str', z: [1, { x: 3, y: 2 }] };
    expect(canonical(a)).toBe(canonical(b));
  });

  it('distinguishes arrays from objects', () => {
    expect(canonical([1, 2])).not.toBe(canonical({ 0: 1, 1: 2 }));
  });

  it('is stable for Maps and Sets regardless of insertion order', () => {
    const m1 = new Map<string, number>([
      ['b', 2],
      ['a', 1],
    ]);
    const m2 = new Map<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(canonical(m1)).toBe(canonical(m2));
    expect(canonical(new Set([2, 1]))).toBe(canonical(new Set([1, 2])));
  });

  it('distinguishes values', () => {
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
    expect(canonical({ a: '1' })).not.toBe(canonical({ a: 1 }));
    expect(canonical({ a: null })).toBe(canonical({ a: undefined }));
  });

  it('does not throw on non-finite numbers', () => {
    expect(() => canonical({ a: Infinity, b: NaN })).not.toThrow();
  });
});

describe('stateHash', () => {
  it('returns a stable 16-hex-char digest', () => {
    const h = stateHash({ shift: 1, record: [] });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(stateHash({ shift: 1, record: [] })).toBe(h);
  });

  it('changes when state changes', () => {
    expect(stateHash({ shift: 1 })).not.toBe(stateHash({ shift: 2 }));
  });

  it('ignores key order', () => {
    expect(stateHash({ a: 1, b: 2 })).toBe(stateHash({ b: 2, a: 1 }));
  });
});
