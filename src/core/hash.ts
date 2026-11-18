/**
 * Canonical state hashing.
 *
 * Used by: the determinism test (same seed twice → same hash), the save
 * round-trip test, and dev-build replay assertions. If two runs of the same
 * seed disagree on this value, something non-deterministic has crept in —
 * usually an unsorted Map iteration, a Date, or Math.random.
 */

/** Stable stringify: sorted object keys, no whitespace, stable arrays. */
export function canonical(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) return `"${String(value)}"`;
    // -0 and 0 must hash the same.
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (t === 'bigint') return `${String(value)}n`;
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (t === 'undefined') return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value instanceof Map) {
    const entries = [...value.entries()]
      .map(([k, v]) => [canonical(k), v] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    return `{${entries.map(([k, v]) => `${k}:${canonical(v)}`).join(',')}}`;
  }
  if (value instanceof Set) {
    return `[${[...value].map(canonical).sort().join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

/** 64-bit-ish hash (two independent 32-bit lanes, printed as hex). */
export function stateHash(value: unknown): string {
  const s = canonical(value);
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x100000001b3) >>> 0;
    h2 ^= h2 >>> 15;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}`;
}
