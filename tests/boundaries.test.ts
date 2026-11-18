/**
 * The boundary checker is a *design* tool here, not hygiene. This test proves the
 * two rules that protect the game's thesis are actually live, by feeding the
 * checker source it must reject.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = join(__dirname, '..');
const CHECKER = join(REPO, 'scripts/check-boundaries.mjs');

function runCheckerIn(files: Record<string, string>): { ok: boolean; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'co-bounds-'));
  try {
    mkdirSync(join(dir, 'src', 'core'), { recursive: true });
    mkdirSync(join(dir, 'src', 'systems'), { recursive: true });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'check-boundaries.mjs'), readChecker());
    for (const [path, code] of Object.entries(files)) {
      writeFileSync(join(dir, 'src', path), code);
    }
    try {
      const out = execFileSync(process.execPath, [join(dir, 'scripts', 'check-boundaries.mjs')], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { ok: true, out };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readChecker(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs').readFileSync(CHECKER, 'utf8') as string;
}

describe('boundary checker', () => {
  it('passes on a clean tree', () => {
    const r = runCheckerIn({ 'core/ok.ts': 'export const x = 1;\n' });
    expect(r.ok, r.out).toBe(true);
  });

  it('rejects Math.random outside core/rng.ts', () => {
    const r = runCheckerIn({ 'systems/bad.ts': 'export const x = Math.random();\n' });
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/Math\.random/);
  });

  it('allows Math.random inside core/rng.ts only', () => {
    const r = runCheckerIn({ 'core/rng.ts': 'export const x = Math.random();\n' });
    expect(r.ok, r.out).toBe(true);
  });

  it('rejects a DOM touch in core', () => {
    const r = runCheckerIn({ 'core/bad.ts': 'export const x = document.body;\n' });
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/DOM|headless/);
  });

  it('allows a guarded typeof check in core', () => {
    const r = runCheckerIn({
      'core/ok.ts': 'export const hasDb = typeof indexedDB !== "undefined";\n',
    });
    expect(r.ok, r.out).toBe(true);
  });

  it('rejects core importing the renderer', () => {
    const r = runCheckerIn({ 'core/bad.ts': 'import { x } from "@render/scene";\n' });
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/render\/ui|one-way/);
  });

  it('rejects a system reading `truth`', () => {
    const r = runCheckerIn({
      'systems/bad.ts': 'export const n = (line: any) => line.truth.classification;\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/truth/);
  });

  it('allows the audit to read truth', () => {
    const r = runCheckerIn({
      'systems/audit.ts': 'export const n = (line: any) => line.truth.classification;\n',
    });
    expect(r.ok, r.out).toBe(true);
  });
});
