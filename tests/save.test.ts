import { describe, expect, it } from 'vitest';
import {
  MemoryStorage,
  SAVE_VERSION,
  SaveError,
  createSaveService,
  decodeSave,
  encodeSave,
  migrate,
} from '@core/save';
import { emptyState, type GameState } from '@core/state';
import { stateHash } from '@core/hash';
import { World } from '@core/world';

function sampleState(): GameState {
  const s = emptyState(1234);
  const world = new World();
  const pawn = world.create('pawn', { pos: { x: 64, y: 96 }, speed: 120 });
  world.create('door', { door: { state: 'locked' } });
  s.world = world.snapshot();
  s.player.entityId = pawn.id;
  s.flags['met_the_overseer'] = true;
  s.flags['brutality'] = 0.42;
  s.record = [{ id: 'r-1-01', claim: { classification: 'P' }, stability: 0.9 }];
  return s;
}

describe('save round-trip', () => {
  it('produces an identical state hash after encode → decode', () => {
    const s = sampleState();
    const json = encodeSave(s);
    const back = decodeSave(json);
    expect(stateHash(back)).toBe(stateHash(s));
  });

  it('stamps the envelope version', () => {
    const json = encodeSave(sampleState());
    expect(JSON.parse(json).envelope.version).toBe(SAVE_VERSION);
  });

  it('refuses a save from a newer build', () => {
    const json = JSON.stringify({
      envelope: { version: SAVE_VERSION + 1 },
      state: sampleState(),
    });
    expect(() => decodeSave(json)).toThrow(/newer build/);
  });

  it('gives a readable error for corrupt JSON', () => {
    expect(() => decodeSave('{not json')).toThrow(SaveError);
    expect(() => decodeSave('{not json')).toThrow(/not valid JSON/);
  });

  it('rejects a state with no seed', () => {
    const s = sampleState() as unknown as Record<string, unknown>;
    delete s.seed;
    const json = JSON.stringify({ envelope: { version: SAVE_VERSION }, state: s });
    expect(() => decodeSave(json)).toThrow(/seed/);
  });

  it('rejects a corrupt world', () => {
    const s = sampleState() as unknown as Record<string, any>;
    s.world = { nextId: 1 };
    const json = JSON.stringify({ envelope: { version: SAVE_VERSION }, state: s });
    expect(() => decodeSave(json)).toThrow(/corrupt world/);
  });
});

describe('migrations', () => {
  it('migrates a v0 (bare GameState) save', () => {
    const s = sampleState();
    const back = migrate(s);
    expect(stateHash(back)).toBe(stateHash(s));
  });

  it('migrates a v1 save, moving flags.record to state.record', () => {
    const s = sampleState();
    const legacyRecord = s.record;
    const v1 = {
      envelope: { version: 1, created: 'x', gameVersion: '0.0.0', contentVersion: '0' },
      state: { ...s, record: undefined, flags: { ...s.flags, record: legacyRecord } },
    };
    const back = migrate(v1);
    expect(back.record).toEqual(legacyRecord);
    expect(back.flags).not.toHaveProperty('record');
    expect(stateHash(back)).toBe(stateHash(s));
  });

  it('fails loudly on a missing migration path', () => {
    // simulate a gap by asking for a version with no registered migration
    const broken = { envelope: { version: 99 }, state: {} };
    expect(() => migrate(broken)).toThrow(/newer build/);
  });
});

describe('save service', () => {
  it('saves, loads and reports existence', async () => {
    const storage = new MemoryStorage();
    const svc = createSaveService(storage);
    const s = sampleState();
    expect(await svc.has()).toBe(false);
    await svc.save(s);
    expect(await svc.has()).toBe(true);
    const back = await svc.load();
    expect(back).not.toBeNull();
    expect(stateHash(back!)).toBe(stateHash(s));
  });

  it('returns null when nothing is saved', async () => {
    expect(await createSaveService(new MemoryStorage()).load()).toBeNull();
  });

  it('clears a slot', async () => {
    const storage = new MemoryStorage();
    const svc = createSaveService(storage);
    await svc.save(sampleState());
    await svc.clear();
    expect(await svc.has()).toBe(false);
  });

  it('exports and imports a shareable JSON file', () => {
    const svc = createSaveService(new MemoryStorage());
    const s = sampleState();
    const json = svc.exportJson(s);
    expect(stateHash(svc.importJson(json))).toBe(stateHash(s));
  });

  it('keeps separate slots independent', async () => {
    const storage = new MemoryStorage();
    const a = createSaveService(storage, 'a');
    const b = createSaveService(storage, 'b');
    const s1 = sampleState();
    const s2 = { ...sampleState(), shift: 9 };
    await a.save(s1);
    await b.save(s2);
    expect((await a.load())!.shift).toBe(1);
    expect((await b.load())!.shift).toBe(9);
  });
});
