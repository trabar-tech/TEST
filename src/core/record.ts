/**
 * The Record — report lines, slack, belief, and the archive (SYS-REC-01 §3–§5).
 *
 * ADR-0002 is the reason this file exists before anything else: the save format,
 * the audit, the Case File and OVERSEER's import all shape themselves around
 * `ReportLine`. Two rules hold the whole thing together:
 *
 *   1. The world is simulated from `claim`. `truth` exists for the audit and for
 *      tests, and no simulation code may read it (lint-enforced).
 *   2. Nothing here mutates a signed line. Lines age, decay and dry up, but the
 *      claim is immutable once stamped — that is what makes the Record a record
 *      rather than a draft.
 *
 * Pure functions only: no clock, no RNG, no IO. Anything time-dependent is
 * passed in, so the audit can be replayed and asserted.
 */

import { stateHash } from './hash';

/* ------------------------------------------------------------------ types */

export type Classification = 'P' | 'C' | 'D' | 'X' | 'B' | '-' | 'R' | 'NR';
export type Category = 'inspection' | 'incident' | 'patrol' | 'household' | 'personal';
export type ForceRung = 1 | 2 | 3 | 4 | 5;
export type Authority = 'self' | 'squad' | 'ai_auto';

export interface Claim {
  classification: Classification;
  force_rung: ForceRung;
  force_tool?: string;
  detainees: number;
  casualties: number;
  /** 0–3 */
  damage: number;
  property?: string[];
}

export interface Truth extends Claim {
  third_party_present: boolean;
  illegal_search: boolean;
  bribe_taken: boolean;
}

export interface WitnessRef {
  id: string;
  /** 0–1 */
  reliability: number;
  /** 0–1 */
  will_talk: number;
}

export interface ExposureReport {
  cameras: string[];
  camera_blocked: boolean;
  witnesses: Array<{ id: string; reliability: number; will_talk: number }>;
  contradictions: string[];
  /** 0–1. Never displayed as a number (SYS-REC-01 §4.4) */
  risk_score: number;
}

export interface Derived {
  slack: number;
  caught: boolean;
  consequences: string[];
}

/**
 * What the tactical scene produced, as the audit sees it. Deliberately *not* part
 * of `claim`: the player can edit a claim, and must be able to — this is the list
 * of things they cannot.
 */
export interface SceneFacts {
  entry: string;
  roomsCleared: number;
  roomsActuallyClear: number;
  loudestNoise: number;
  heardByNeighbours: number;
  damage: number;
  wallsBreached: number;
  unfound: number;
  stabilised: number;
  unauthorisedForce: boolean;
}

export interface ReportLine {
  /** "r-<shift>-<seq>" */
  id: string;
  shift: number;
  event_ref: string;
  category: Category;
  claim: Claim;
  /** max 240 chars */
  free_text: string;
  tags: string[];
  truth: Truth;
  witnesses: WitnessRef[];
  authority: Authority;
  /** 0..1 */
  stability: number;
  /** shifts remaining before the line dries */
  lifespan: number;
  exposure: ExposureReport;
  derived: Derived;
  /** present only on incident lines (P2); absent means "no tactical scene" */
  scene?: SceneFacts;
}

/* ------------------------------------------------------------------- slack */

/**
 * Slack = the measured gap between what happened and what was written
 * (SYS-REC-01 §4.2). Pure, table-tested, and the only definition in the codebase.
 */
export function slack(claim: Claim, truth: Truth): number {
  let total = 0;
  if (claim.classification !== truth.classification) total += 0.35;
  if (claim.force_rung !== truth.force_rung) total += 0.25;
  total += Math.min(0.3, Math.abs(claim.detainees - truth.detainees) * 0.15);
  total += Math.abs(claim.damage - truth.damage) * 0.1;

  const mentioned = (needle: string): boolean =>
    claim.property?.includes(needle) === true;

  // Omitting a *material* fact is its own kind of lie, and the one players most
  // naturally tell: "nobody asked me about the third person in the room."
  if (truth.third_party_present && !mentioned('third_party')) total += 0.2;
  if (truth.illegal_search && !mentioned('illegal_search')) total += 0.2;
  if (truth.bribe_taken && !mentioned('bribe_taken')) total += 0.2;

  return Math.min(1, Math.round(total * 1000) / 1000);
}

/** Convenience: a claim identical to the truth. */
export function claimOf(truth: Truth): Claim {
  return {
    classification: truth.classification,
    force_rung: truth.force_rung,
    ...(truth.force_tool === undefined ? {} : { force_tool: truth.force_tool }),
    detainees: truth.detainees,
    casualties: truth.casualties,
    damage: truth.damage,
    ...(truth.property === undefined ? {} : { property: [...truth.property] }),
  };
}

/* -------------------------------------------------------------- the store */

export interface Belief {
  /** Σ claim.classification === 'R' — under-reporting grows the Cell */
  resistance_estimate: number;
  /** Σ claim.force_rung >= 3 — over-reporting licenses more force */
  brutality_index: number;
  /** Σ tags include 'syndicate' */
  syndicate_presence: number;
  /** citizens with a C/D claim: specific people remember specific lines */
  grievance_list: string[];
  /** how many lines the belief was computed from, for legibility in the UI */
  lines: number;
}

export function emptyBelief(): Belief {
  return {
    resistance_estimate: 0,
    brutality_index: 0,
    syndicate_presence: 0,
    grievance_list: [],
    lines: 0,
  };
}

export interface RecordQuery {
  shift?: number;
  category?: Category;
  tag?: string;
  classification?: Classification;
  authority?: Authority;
}

export interface AgingOptions {
  /** base decay per shift (SYS-REC-01 §5.4) */
  decay?: number;
}

/**
 * Append-only store. `live()` excludes dried lines; `archive()` is everything.
 *
 * Deliberately not a class with event sourcing: the array *is* the state, it is
 * JSON-safe, and `stateHash(store.lines)` is the save-relevant identity.
 */
export class RecordStore {
  private readonly items: ReportLine[] = [];

  append(line: ReportLine): ReportLine {
    if (this.items.some((l) => l.id === line.id)) {
      throw new Error(`record: duplicate line id ${line.id}`);
    }
    this.items.push(line);
    return line;
  }

  /** Next id for a shift, so callers never invent one. */
  nextId(shift: number): string {
    let maxSeq = 0;
    const prefix = `r-${shift}-`;
    for (const line of this.items) {
      if (line.id.startsWith(prefix)) {
        const seq = Number(line.id.slice(prefix.length));
        if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
  }

  live(): ReportLine[] {
    return this.items.filter((l) => l.lifespan > 0);
  }

  archive(): ReportLine[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  byId(id: string): ReportLine | undefined {
    return this.items.find((l) => l.id === id);
  }

  query(q: RecordQuery): ReportLine[] {
    return this.items.filter((l) => {
      if (q.shift !== undefined && l.shift !== q.shift) return false;
      if (q.category !== undefined && l.category !== q.category) return false;
      if (q.tag !== undefined && !l.tags.includes(q.tag)) return false;
      if (q.classification !== undefined && l.claim.classification !== q.classification) return false;
      if (q.authority !== undefined && l.authority !== q.authority) return false;
      return true;
    });
  }

  /** Active contradictions against a claim that has not been filed yet. */
  contradictionsFor(candidate: { claim: Claim; witnesses: WitnessRef[] }): string[] {
    const out: string[] = [];
    for (const line of this.live()) {
      if (line.stability < 0.2) continue;
      // same event filed twice with a different classification is a
      // machine-detectable contradiction, independent of witness testimony
      if (
        candidate.claim.classification !== line.claim.classification &&
        candidate.witnesses.some((w) => line.witnesses.some((lw) => lw.id === w.id))
      ) {
        out.push(line.id);
      }
    }
    return out;
  }

  /**
   * Belief is computed from claims only. This is the whole game's thesis in one
   * function: the city is what the paperwork says it is.
   */
  belief(): Belief {
    const b = emptyBelief();
    for (const line of this.items) {
      if (line.authority === 'ai_auto' && line.claim.classification === '-') continue;
      if (line.claim.classification === 'R') b.resistance_estimate += 1;
      if (line.claim.force_rung >= 3) b.brutality_index += 1;
      if (line.tags.includes('syndicate')) b.syndicate_presence += 1;
      const c = line.claim.classification;
      if ((c === 'C' || c === 'D') && !b.grievance_list.includes(line.event_ref)) {
        b.grievance_list.push(line.event_ref);
      }
      b.lines += 1;
    }
    b.grievance_list.sort();
    return b;
  }

  /** Lines whose stability has fallen below the visible-crack threshold. */
  cracked(threshold = 0.4): ReportLine[] {
    return this.items.filter((l) => l.stability < threshold && l.lifespan > 0);
  }

  /**
   * A contradiction has been discovered: the line's foundation cracks
   * (SYS-REC-01 §5.4, −0.4). This — not slow aging — is what produces the
   * visible crack, because decay alone cannot outrun a line's lifespan.
   */
  destabilise(ids: readonly string[], amount = 0.4): ReportLine[] {
    const hit: ReportLine[] = [];
    for (const line of this.items) {
      if (!ids.includes(line.id)) continue;
      line.stability = Math.max(0, Math.round((line.stability - amount) * 1000) / 1000);
      hit.push(line);
    }
    return hit;
  }

  /** Corroboration strengthens a line: +0.2, capped at 1. */
  corroborate(id: string, amount = 0.2): ReportLine | undefined {
    const line = this.byId(id);
    if (!line) return undefined;
    line.stability = Math.min(1, Math.round((line.stability + amount) * 1000) / 1000);
    return line;
  }

  /**
   * Aging, applied once per shift (SYS-REC-01 §5.4).
   * Returns the lines that dried up this shift, so the UI can say so.
   */
  age(options: AgingOptions = {}): ReportLine[] {
    const decay = options.decay ?? 0.05;
    const dried: ReportLine[] = [];
    for (const line of this.items) {
      if (line.lifespan <= 0) continue;
      line.stability = Math.max(0, Math.round((line.stability - decay) * 1000) / 1000);
      line.lifespan -= 1;
      if (line.lifespan <= 0) dried.push(line);
    }
    return dried;
  }

  /** Save payload: the array, in append order. */
  toJSON(): ReportLine[] {
    return this.items.map((l) => structuredCloneish(l) as ReportLine);
  }

  restore(lines: ReportLine[]): void {
    this.items.length = 0;
    for (const line of lines) this.items.push(structuredCloneish(line) as ReportLine);
  }

  hash(): string {
    return stateHash({ lines: this.items });
  }
}

/** JSON-safe deep copy without depending on `structuredClone` (older test envs). */
function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* --------------------------------------------------------------- factories */

export interface MakeLineOptions {
  id: string;
  shift: number;
  event_ref: string;
  category: Category;
  claim: Claim;
  truth: Truth;
  witnesses?: WitnessRef[];
  tags?: string[];
  free_text?: string;
  authority?: Authority;
  exposure?: Partial<ExposureReport>;
}

export function makeLine(opts: MakeLineOptions): ReportLine {
  const witnesses = opts.witnesses ?? [];
  const exposure: ExposureReport = {
    cameras: opts.exposure?.cameras ?? [],
    camera_blocked: opts.exposure?.camera_blocked ?? false,
    witnesses: opts.exposure?.witnesses ?? witnesses.map((w) => ({ ...w })),
    contradictions: opts.exposure?.contradictions ?? [],
    risk_score: opts.exposure?.risk_score ?? 0,
  };
  return {
    id: opts.id,
    shift: opts.shift,
    event_ref: opts.event_ref,
    category: opts.category,
    claim: structuredCloneish(opts.claim),
    free_text: (opts.free_text ?? '').slice(0, 240),
    tags: [...(opts.tags ?? [])],
    truth: structuredCloneish(opts.truth),
    witnesses: witnesses.map((w) => ({ ...w })),
    authority: opts.authority ?? 'self',
    stability: 1,
    lifespan: 6,
    exposure,
    derived: { slack: slack(opts.claim, opts.truth), caught: false, consequences: [] },
  };
}

/* -------------------------------------------------------------- exposure */

export interface ExposureInput {
  candidate: Claim;
  truth: Truth;
  cameras: string[];
  witnesses: WitnessRef[];
  contradictions: string[];
}

/**
 * Risk as the player sees it: one band, never a number (SYS-REC-01 §4.4).
 *
 * The band answers **"will this come back at me?"**, not **"how big is the
 * lie?"** — those are different questions, and conflating them produced a gutter
 * that called a camera-observed lie "thin" while the audit caught it every
 * single time. So:
 *
 *   - an honest claim is always safe, however many cameras are on it;
 *   - a lie under a camera is always hanging: it is *certain* to be caught;
 *   - a lie with no evidence is safe: you can hide almost anything exactly once;
 *   - witness and contradiction strength set the middle.
 *
 * The magnitude of the lie (`slack`) still matters — to the peer-pattern test
 * and to the world — it just isn't what the gutter reports.
 */
export function computeExposure(input: ExposureInput): ExposureReport {
  const s = slack(input.candidate, input.truth);
  const witnessStrength = input.witnesses.length > 0
    ? Math.max(...input.witnesses.map((w) => w.reliability * w.will_talk))
    : 0;
  const evidence = Math.max(
    input.cameras.length > 0 ? 1 : 0,
    witnessStrength,
    input.contradictions.length > 0 ? 0.85 : 0,
  );
  // nothing to expose if nothing diverges, and no lie counts without evidence
  const risk = s === 0 || evidence === 0 ? 0 : Math.min(1, evidence * (0.6 + 0.4 * s));
  return {
    cameras: [...input.cameras],
    camera_blocked: input.cameras.length === 0,
    witnesses: input.witnesses.map((w) => ({ ...w })),
    contradictions: [...input.contradictions],
    risk_score: Math.round(risk * 1000) / 1000,
  };
}

export type RiskBand = 'safe' | 'thin' | 'hanging';

export function riskBand(risk: number): RiskBand {
  if (risk < 0.2) return 'safe';
  if (risk < 0.5) return 'thin';
  return 'hanging';
}
