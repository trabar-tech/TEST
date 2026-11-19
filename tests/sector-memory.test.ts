/**
 * The sector's memory survives a save — the debt Phase 2 left open.
 *
 * `force_index` is the mechanic that makes "suppression breeds resistance" true.
 * If a page reload forgets it, the claim is cosmetic. These tests round-trip it
 * through the real save codec, not through a mock.
 */

import { describe, expect, it } from 'vitest';
import { emptyState } from '@core/state';
import { createSaveService, decodeSave, encodeSave, MemoryStorage, SAVE_VERSION } from '@core/save';
import {
  describeSector,
  forceIndexOf,
  nextShift,
  readSector,
  recordForce,
  sectorFacts,
  writeSector,
} from '@systems/sector';

describe('sector memory', () => {
  it('starts quiet, and reading a state that has never been policed is safe', () => {
    const state = emptyState(1);
    const m = readSector(state);
    expect(m.force).toBe(0);
    expect(m.shifts).toBe(0);
    expect(describeSector(m)).toMatch(/quiet after 0 shifts/);
  });

  it('accumulates force from incidents and rounds to two places', () => {
    const state = emptyState(1);
    recordForce(state, 2.5);
    const m = recordForce(state, 6);
    expect(m.force).toBe(8.5);
    expect(state.flags['sector.force']).toBe(8.5);
  });

  it('decays 15% at the shift boundary and counts the shift', () => {
    const state = emptyState(1);
    recordForce(state, 10);
    const { memory, rung } = nextShift(state);
    expect(memory.force).toBe(8.5);
    expect(memory.shifts).toBe(1);
    // 8.5/20 = 0.425, which is already "braced": the ratchet is felt on the next
    // shift, not three shifts later
    expect(rung).toBe(2);
    expect(readSector(state).force).toBe(8.5);
  });

  it('raises the starting rung and mood once the sector is hot', () => {
    const state = emptyState(1);
    recordForce(state, 18);
    const { rung, mood } = nextShift(state, { decay: false });
    expect(rung).toBe(3);
    expect(mood.aggression).toBeGreaterThan(1);
  });

  it('survives a real save/load round trip', async () => {
    const storage = new MemoryStorage();
    const saves = createSaveService(storage);
    const state = emptyState(4242);
    recordForce(state, 6);
    recordForce(state, 2.5);
    recordForce(state, 1);

    await saves.save(state);
    const loaded = (await saves.load())!;
    expect(readSector(loaded).force).toBe(9.5);

    // and the *encoder* is not doing anything magic: this is plain JSON in flags
    const json = encodeSave(state);
    expect(json).toContain('sector.force');
    expect(decodeSave(json).flags['sector.force']).toBe(9.5);
  });

  it('a save from before this existed loads with a quiet sector, not an error', () => {
    const state = emptyState(7);
    const legacy = JSON.parse(encodeSave(state)) as { envelope: { version: number }; state: Record<string, unknown> };
    (legacy.state as { flags: Record<string, unknown> }).flags = {};
    const loaded = decodeSave(JSON.stringify(legacy));
    expect(loaded.flags['sector.force']).toBeUndefined();
    expect(readSector(loaded).force).toBe(0);
  });

  it('a corrupt value in flags cannot crash the sim', () => {
    const state = emptyState(1);
    state.flags['sector.force'] = 'a lot' as unknown as number;
    expect(readSector(state).force).toBe(0);
  });

  it('exposes the index in the shape the tactical layer reads', () => {
    const state = emptyState(1);
    recordForce(state, 4);
    expect(forceIndexOf(state)).toEqual({ sector: 'kiln_row', value: 4 });
  });

  it('describes itself in words a player can read, with no meter', () => {
    const state = emptyState(1);
    recordForce(state, 20);
    expect(describeSector(readSector(state))).toMatch(/hostile/);
    expect(sectorFacts(state)).toHaveLength(3);
  });

  it('writes nothing that is not JSON-safe', () => {
    const state = emptyState(1);
    recordForce(state, 3.333);
    const json = JSON.stringify(state.flags);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(readSector(state).force).toBe(3.33);
  });

  it('the save version this writes is the one the reader expects', () => {
    const state = emptyState(1);
    writeSector(state, { sector: 'kiln_row', force: 1, shifts: 2 });
    const env = JSON.parse(encodeSave(state)) as { envelope: { version: number } };
    expect(env.envelope.version).toBe(SAVE_VERSION);
  });
});
