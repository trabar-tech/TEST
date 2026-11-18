import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  ContentError,
  findDirectiveCycles,
  formatIssues,
  indexContent,
  parseContent,
} from '@core/content';
import { ContentBundleSchema } from '@core/content';

const SAMPLE = resolve(__dirname, '../content/examples/content.sample.json');
const raw = (): unknown => JSON.parse(readFileSync(SAMPLE, 'utf8'));

describe('content parsing', () => {
  it('accepts the shipped sample content', () => {
    const bundle = parseContent(raw(), 'content.sample.json');
    expect(bundle.micro_events.length).toBeGreaterThan(0);
    expect(bundle.citizens.length).toBeGreaterThan(0);
  });

  it('reports the file, path and message for a missing required field', () => {
    const data = raw() as Record<string, any>;
    delete data.micro_events[0].requires.temperature;
    delete data.micro_events[0].beats;
    try {
      parseContent(data, 'content.sample.json');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      const err = e as ContentError;
      expect(err.file).toBe('content.sample.json');
      expect(err.message).toMatch(/content\.sample\.json: /);
      expect(err.path).toContain('micro_events');
      expect(err.path).toContain('beats');
    }
  });

  it('rejects a malformed chip serial', () => {
    const data = raw() as Record<string, any>;
    data.citizens[0].papers.chip_serial = 'nope';
    expect(() => parseContent(data)).toThrow(/chip_serial must look like/);
  });

  it('rejects an unknown field in a strict schema (requires)', () => {
    const data = raw() as Record<string, any>;
    data.micro_events[0].requires.something_we_made_up = true;
    expect(() => parseContent(data)).toThrow();
  });

  it('rejects a storylet with fewer than two resolutions', () => {
    const data = raw() as Record<string, any>;
    data.micro_events[0].resolutions = [data.micro_events[0].resolutions[0]];
    expect(() => parseContent(data)).toThrow();
  });

  it('rejects an invalid classification code', () => {
    const data = raw() as Record<string, any>;
    data.micro_events[0].resolutions[0].claim = 'Z';
    expect(() => parseContent(data)).toThrow();
  });

  it('formats issues as path — message', () => {
    const parsed = ContentBundleSchema.safeParse({ incidents: [{ id: '' }] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issues = formatIssues(parsed.error.issues);
      expect(issues[0]!.path).toContain('incidents.0');
      expect(typeof issues[0]!.message).toBe('string');
    }
  });
});

describe('content indexing', () => {
  it('builds id maps', () => {
    const loaded = indexContent(parseContent(raw()));
    expect(loaded.byId.citizens.has('c-0221')).toBe(true);
    expect(loaded.byId.storylets.has('me-0031')).toBe(true);
    expect(loaded.byId.directives.has('dir-0197')).toBe(true);
  });

  it('measures the connective-tissue ratio', () => {
    const loaded = indexContent(parseContent(raw()));
    // the epilogue references me-0031, the origin storylet does not → 0.5
    expect(loaded.report.connectiveTissueRatio).toBeCloseTo(0.5, 5);
  });

  it('finds unresolved storylet references', () => {
    const data = raw() as Record<string, any>;
    data.micro_events[1].references = ['me-does-not-exist'];
    const loaded = indexContent(parseContent(data));
    expect(loaded.report.unresolvedReferences[0]).toContain('me-does-not-exist');
  });

  it('detects duplicate ids', () => {
    const data = raw() as Record<string, any>;
    data.micro_events.push({ ...data.micro_events[0] });
    const loaded = indexContent(parseContent(data));
    expect(loaded.report.duplicateIds).toContain('storylets:me-0031');
  });

  it('freezes content so systems cannot mutate it', () => {
    const loaded = indexContent(parseContent(raw()));
    expect(Object.isFrozen(loaded.bundle)).toBe(true);
    expect(() => {
      (loaded.bundle.micro_events[0] as { title: string }).title = 'hacked';
    }).toThrow();
  });
});

describe('directive contradiction graph', () => {
  const d = (id: string, contradicts: string[]) => ({
    id,
    type: 'daily' as const,
    text: id,
    quota: null,
    contradicts,
    audit_weight: 1,
  });

  it('accepts an acyclic graph', () => {
    expect(findDirectiveCycles([d('a', ['b']), d('b', [])])).toEqual([]);
  });

  it('detects a direct two-node cycle', () => {
    const cycles = findDirectiveCycles([d('a', ['b']), d('b', ['a'])]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatch(/a/);
  });

  it('detects a three-node cycle', () => {
    const cycles = findDirectiveCycles([d('a', ['b']), d('b', ['c']), d('c', ['a'])]);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores references to unknown ids', () => {
    expect(findDirectiveCycles([d('a', ['ghost'])])).toEqual([]);
  });
});
