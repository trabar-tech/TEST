/**
 * P1-T08 tone tests. Cheap, and they catch the two ways this goes wrong: a line
 * that breaks the game's own banned vocabulary, and a set so small that the
 * street repeats itself within one shift.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Barks, type BarkSet } from '@systems/barks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const set = JSON.parse(
  readFileSync(resolve(__dirname, '../content/examples/barks.json'), 'utf8'),
) as BarkSet;

const BANNED = ['evil', 'hero', 'tyrant', 'freedom fighter', 'bad guy', 'villain'];

describe('barks', () => {
  it('ships enough lines to fill a shift without repeating', () => {
    const all = [...set.loudspeaker, ...set.radio, ...set.ambient];
    expect(all.length).toBeGreaterThanOrEqual(15);
    expect(set.loudspeaker.length).toBeGreaterThanOrEqual(5);
    // 22 sim-minutes at ~26s intervals is ~50 slots; the radio pool covers the
    // rest, and repeats are acceptable only after the whole pool is spent
    expect(new Set(all).size).toBe(all.length);
  });

  it('never uses the banned vocabulary', () => {
    const text = JSON.stringify({ ...set, _note: '', _rules: [] }).toLowerCase();
    for (const word of BANNED) expect(text, word).not.toContain(word);
  });

  it('the Directorate never speaks in the first person singular', () => {
    for (const line of [...set.loudspeaker, ...set.radio]) {
      expect(line.toLowerCase(), line).not.toMatch(/\bi (am|will|want|think)\b/);
    }
  });

  it('a shift replays the same street sounds', () => {
    const a = new Barks(set, 42, 1);
    const b = new Barks(set, 42, 1);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let t = 0; t < 600; t += 1) {
      const x = a.next(t);
      const y = b.next(t);
      if (x) seqA.push(x.text);
      if (y) seqB.push(y.text);
    }
    expect(seqA.length).toBeGreaterThan(3);
    expect(seqB).toEqual(seqA);
  });

  it('different shifts hear different streets', () => {
    const collect = (shift: number) => {
      const b = new Barks(set, 42, shift);
      const out: string[] = [];
      for (let t = 0; t < 900; t += 1) {
        const x = b.next(t);
        if (x) out.push(x.text);
      }
      return out.join('|');
    };
    expect(collect(1)).not.toBe(collect(2));
  });

  it('never repeats a line until the pool is spent', () => {
    const b = new Barks(set, 7, 1);
    const heard: string[] = [];
    for (let t = 0; t < 4000; t += 1) {
      const x = b.next(t);
      if (x) heard.push(x.text);
    }
    const dupes = heard.filter((t, i) => heard.indexOf(t) !== i);
    expect(dupes).toEqual([]);
  });
});
