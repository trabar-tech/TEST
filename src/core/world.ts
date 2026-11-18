/**
 * Minimal ECS-lite world.
 *
 * Deliberately not an archetype ECS: this game has tens of entities, not tens
 * of thousands, and readable code is worth more than cache locality here.
 * Entities have stable ids (part of the save); components are plain objects
 * keyed by name; iteration order is always sorted by id so that determinism
 * never depends on Map insertion order.
 */

export type EntityId = number;

export interface Entity {
  id: EntityId;
  /** archetype tag, for debugging and coarse filters */
  kind: string;
  /** components by name */
  c: Record<string, unknown>;
}

export interface WorldSnapshot {
  nextId: EntityId;
  entities: Array<{ id: EntityId; kind: string; c: Record<string, unknown> }>;
}

/** Structured clone of plain JSON component data, without the cost of
 *  `JSON.parse(JSON.stringify(...))` on a hot path. */
function cloneComponents(c: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k in c) out[k] = cloneValue(c[k]);
  return out;
}

function cloneValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(cloneValue);
  const o: Record<string, unknown> = {};
  for (const k in v as Record<string, unknown>) o[k] = cloneValue((v as Record<string, unknown>)[k]);
  return o;
}

export class World {
  private entities = new Map<EntityId, Entity>();
  private nextId: EntityId = 1;
  /** cached sorted id list, invalidated on structural change */
  private sortedIds: EntityId[] | null = null;

  create(kind: string, components: Record<string, unknown> = {}): Entity {
    const id = this.nextId++;
    const e: Entity = { id, kind, c: { ...components } };
    this.entities.set(id, e);
    this.sortedIds = null;
    return e;
  }

  get(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  remove(id: EntityId): boolean {
    const ok = this.entities.delete(id);
    if (ok) this.sortedIds = null;
    return ok;
  }

  has(id: EntityId): boolean {
    return this.entities.has(id);
  }

  get size(): number {
    return this.entities.size;
  }

  /** All entities, sorted by id (deterministic iteration). */
  all(): Entity[] {
    if (!this.sortedIds) {
      this.sortedIds = [...this.entities.keys()].sort((a, b) => a - b);
    }
    const out: Entity[] = [];
    for (const id of this.sortedIds) {
      const e = this.entities.get(id);
      if (e) out.push(e);
    }
    return out;
  }

  /** Entities of a kind, sorted by id. */
  ofKind(kind: string): Entity[] {
    return this.all().filter((e) => e.kind === kind);
  }

  /** Entities having every named component, sorted by id. */
  with(...componentNames: string[]): Entity[] {
    return this.all().filter((e) => componentNames.every((n) => n in e.c));
  }

  /**
   * Deep copy. Component values are plain JSON — that is a rule, not a
   * coincidence, because the save (and the replay hash) both depend on it.
   * A shallow copy aliased nested objects, so two worlds restored from the
   * same snapshot could silently share a position vector.
   */
  snapshot(): WorldSnapshot {
    return {
      nextId: this.nextId,
      entities: this.all().map((e) => ({ id: e.id, kind: e.kind, c: cloneComponents(e.c) })),
    };
  }

  restore(s: WorldSnapshot): void {
    this.entities.clear();
    for (const raw of s.entities) {
      this.entities.set(raw.id, { id: raw.id, kind: raw.kind, c: cloneComponents(raw.c) });
    }
    this.nextId = s.nextId;
    this.sortedIds = null;
  }
}
