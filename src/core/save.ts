/**
 * Save/load with a versioned envelope.
 *
 * ADR-0002 makes the save the player's memory and the OVERSEER import
 * payload, so the envelope is versioned from day one and migrations are
 * mandatory — never break a save silently (TECH-01 §6).
 *
 * Storage is injected so the same code runs in the browser, in Node tests
 * (memory), and in an export/import file. The browser adapter lives in
 * src/platform/storage.ts, because `core/` may not touch `indexedDB` at all —
 * the boundary checker enforces that (ADR-0001).
 */

import type { GameState } from './state';

export const SAVE_VERSION = 2;

export interface SaveEnvelope {
  envelope: {
    version: number;
    created: string;
    gameVersion: string;
    /** content version the save was made against */
    contentVersion: string;
  };
  state: GameState;
}

export interface SaveStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/* ------------------------------------------------------------- memory store */

export class MemoryStorage implements SaveStorage {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
  async del(key: string) {
    this.map.delete(key);
  }
  async keys() {
    return [...this.map.keys()].sort();
  }
}

/* ------------------------------------------------------------------ codec */

export class SaveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SaveError';
  }
}

export function encodeSave(state: GameState, opts: { gameVersion?: string } = {}): string {
  const env: SaveEnvelope = {
    envelope: {
      version: SAVE_VERSION,
      created: new Date(0).toISOString(), // deterministic: real timestamp added by the caller if wanted
      gameVersion: opts.gameVersion ?? '0.0.1',
      contentVersion: state.contentVersion,
    },
    state,
  };
  return JSON.stringify(env);
}

export function decodeSave(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new SaveError('save file is not valid JSON', { cause: e });
  }
  return migrate(raw);
}

/* ------------------------------------------------------------ migrations */

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade *from*.
 * v0 → v1: pre-envelope saves (a bare GameState) get wrapped.
 * v1 → v2: `record` moved from `flags.record` onto the state root.
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (input) => ({
    envelope: {
      version: 1,
      created: new Date(0).toISOString(),
      gameVersion: '0.0.0',
      contentVersion: String((input as { contentVersion?: string }).contentVersion ?? '0'),
    },
    state: input,
  }),
  1: (input) => {
    const env = input as { envelope: Record<string, unknown>; state: Record<string, unknown> };
    const state = env.state;
    const flags = (state.flags ?? {}) as Record<string, unknown>;
    // v2 also introduces rng stream positions; older saves resume from a fresh stream
    const rng = (state.rng ?? {}) as Record<string, number>;
    const legacyRecord = flags.record ?? [];
    delete flags.record;
    return {
      envelope: { ...env.envelope, version: 2 },
      state: { ...state, record: state.record ?? legacyRecord, flags, rng },
    };
  },
};

export function migrate(rawInput: unknown): GameState {
  let raw = rawInput as Record<string, unknown>;
  // a bare GameState (no envelope) is a v0 save
  let version = typeof raw.envelope === 'object' && raw.envelope !== null
    ? Number((raw.envelope as { version?: number }).version ?? 0)
    : 0;

  if (!Number.isFinite(version) || version < 0) throw new SaveError('save has an invalid version');
  if (version > SAVE_VERSION) {
    throw new SaveError(
      `save was made by a newer build (v${version}, this build reads up to v${SAVE_VERSION})`,
    );
  }

  while (version < SAVE_VERSION) {
    const fn = MIGRATIONS[version];
    if (!fn) throw new SaveError(`no migration from v${version} to v${version + 1}`);
    raw = fn(raw);
    version += 1;
  }

  const env = raw as unknown as SaveEnvelope;
  if (!env.state || typeof env.state !== 'object') throw new SaveError('save has no state');
  const s = env.state;
  if (typeof s.seed !== 'number') throw new SaveError('save is missing `seed`');
  if (!s.world || !Array.isArray(s.world.entities)) throw new SaveError('save has a corrupt world');
  if (!Array.isArray(s.record)) throw new SaveError('save has a corrupt `record`');
  if (s.rng !== undefined && (typeof s.rng !== 'object' || Array.isArray(s.rng))) {
    throw new SaveError('save has a corrupt `rng` table');
  }
  s.rng ??= {};
  const modes = ['patrol', 'pause', 'plan', 'focus', 'brief'];
  if (s.tick !== undefined && !modes.includes((s.tick as { mode?: string }).mode ?? '')) {
    throw new SaveError(`save has an unknown time mode: ${(s.tick as { mode?: string }).mode}`);
  }
  return s;
}

/* ---------------------------------------------------------------- service */

export interface SaveService {
  save(state: GameState): Promise<void>;
  load(): Promise<GameState | null>;
  has(): Promise<boolean>;
  clear(): Promise<void>;
  /** human-shareable backup */
  exportJson(state: GameState): string;
  importJson(json: string): GameState;
}

export function createSaveService(storage: SaveStorage, slot = 'slot-1'): SaveService {
  return {
    async save(state) {
      await storage.set(slot, encodeSave(state));
    },
    async load() {
      const raw = await storage.get(slot);
      if (raw === null) return null;
      return decodeSave(raw);
    },
    async has() {
      return (await storage.get(slot)) !== null;
    },
    async clear() {
      await storage.del(slot);
    },
    exportJson(state) {
      return encodeSave(state);
    },
    importJson(json) {
      return decodeSave(json);
    },
  };
}
