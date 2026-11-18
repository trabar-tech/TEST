/**
 * The shift — the scene, the clock, the Warden, and the day's paperwork.
 *
 * One object owns the mutable simulation state for a shift: the pawn, the six
 * citizens, the docket of events, and the Record. `main.ts` owns the DOM and the
 * renderer and knows nothing about any of this beyond the handful of commands
 * below.
 *
 * Phase 1 is one shift long. That is a feature: the loop it closes
 * (briefing → beat → desk → audit → next briefing) is the game, and it should be
 * proven at one shift before it is repeated fifteen times.
 */

import { Clock, type TimeMode } from '@core/clock';
import { EventBus } from '@core/bus';
import { World } from '@core/world';
import { findPath, type TileMap, type Vec2 } from '@core/nav';
import { streamFor, type Rng } from '@core/rng';
import {
  RecordStore,
  claimOf,
  computeExposure,
  makeLine,
  riskBand,
  slack,
  type Belief,
  type Claim,
  type Classification,
  type ExposureReport,
  type ReportLine,
  type Truth,
} from '@core/record';
import { emptyState, type GameState } from '@core/state';
import { runAudit, autoFile, type AuditResult } from './audit';
import { Citizens, type CitizenComponents, type CitizenDef, type PostDef } from './citizens';
import {
  MAX_QUESTIONS,
  QUESTIONS,
  answerQuestion,
  runChecks,
  type CheckResult,
  type QuestionId,
  type TranscriptEntry,
} from './inspection';

/* --------------------------------------------------------------- content */

export interface MapJsonSlice {
  id: string;
  name: string;
  tileSize: number;
  width: number;
  height: number;
  player_start: [number, number];
  posts: PostDef[];
  cameras: Array<{ id: string; label: string; x: number; y: number; w: number; h: number }>;
}

export interface CitizenFile {
  citizens: CitizenDef[];
  routines: Record<string, string[]>;
}

/* ---------------------------------------------------------------- docket */

export type EventKind = 'inspection' | 'incident' | 'patrol';

/** One thing that happened and now wants a line written about it. */
export interface DocketEvent {
  ref: string;
  kind: EventKind;
  /** headline shown on the docket card */
  title: string;
  /** what the Warden actually did or saw, in one sentence */
  note: string;
  truth: Truth;
  /** citizen id when the event came from an inspection */
  subject?: string;
  cameras: string[];
  witnesses: ReportLine['witnesses'];
  /** filing this is worth this much of the daily quota */
  quota: number;
  /** the draft the player starts from, so a decision is a decision */
  draft: Claim;
  tags_hint: string[];
}

/* ------------------------------------------------------------------ shift */

export interface ShiftOptions {
  seed: number;
  shift?: number;
  map: TileMap;
  mapJson: MapJsonSlice;
  citizens: CitizenFile;
  /** quota for the shift; Phase 1 keeps it honest-but-tight */
  quotaInspections?: number;
  bus?: EventBus;
}

export interface InspectionState {
  citizenId: string;
  asked: QuestionId[];
  transcript: TranscriptEntry[];
  checks: CheckResult[];
  fullCheckDone: boolean;
  openedAtTick: number;
}

export type Phase = 'brief' | 'beat' | 'desk' | 'audit' | 'debrief';

const SPEED_TILES_PER_SEC = 2.4;
const BODY_RADIUS = 0.3;
/** 06:00 to 23:59 in fiction, compressed: one shift is ~22 sim-minutes */
export const SHIFT_LENGTH_SECONDS = 22 * 60;

export class Simulation {
  readonly clock: Clock;
  readonly world = new World();
  readonly bus: EventBus;
  readonly map: TileMap;
  readonly state: GameState;

  readonly mapJson: MapJsonSlice;
  readonly citizens: Citizens;
  readonly record = new RecordStore();
  readonly docket: DocketEvent[] = [];

  phase: Phase = 'brief';
  inspection: InspectionState | null = null;
  lastAudit: AuditResult | null = null;
  /** set by main.ts on hover; the renderer reads it to outline a citizen */
  hoveredCitizenId: string | null = null;
  /** what the previous shift's paperwork did to this one's briefing */
  briefing: string[] = [];
  quotaInspections: number;
  inspectionsDone = 0;

  private readonly rng: Rng;
  private pawnId = 0;
  private pos: Vec2 = { x: 0, y: 0 };
  private facing = 0;
  private lastSteps = 0;

  constructor(opts: ShiftOptions) {
    this.map = opts.map;
    this.mapJson = opts.mapJson;
    this.bus = opts.bus ?? new EventBus({ recording: true });
    this.quotaInspections = opts.quotaInspections ?? 3;

    const state = emptyState(opts.seed);
    state.shift = opts.shift ?? 1;
    this.state = state;
    this.rng = streamFor(opts.seed, state.shift, 'warden');

    const [sx, sy] = opts.mapJson.player_start;
    const start = this.map.toWorld(sx, sy);
    const pawn = this.world.create('pawn', {
      pos: { x: start.x, y: start.y },
      facing: 0,
      role: 'warden',
      route: [],
      routeIndex: 0,
    });
    this.pawnId = pawn.id;
    this.pos = { x: start.x, y: start.y };
    state.player.entityId = pawn.id;
    state.contentVersion = '0.1.0';

    this.clock = new Clock({ step: (dt) => this.step(dt), mode: 'brief' });

    this.citizens = new Citizens(
      this,
      this.map,
      opts.citizens.citizens,
      opts.mapJson.posts,
      opts.citizens.routines,
      opts.seed,
      state.shift,
    );

    this.bus.emit('shift:ready', {
      seed: opts.seed,
      shift: state.shift,
      citizens: opts.citizens.citizens.length,
      quota: this.quotaInspections,
    });
  }

  /* ------------------------------------------------------------ accessors */

  get position(): Vec2 {
    return this.pos;
  }

  /** camera footprints, for the renderer's coverage layer */
  get cameras(): MapJsonSlice['cameras'] {
    return this.mapJson.cameras;
  }

  /** the cast, for the renderer */
  get citizenRoster(): ReadonlyArray<{ id: string; name: string }> {
    return this.citizens.all.map((c) => ({ id: c.id, name: c.name }));
  }

  citizenPosition(id: string): Vec2 | undefined {
    return this.citizens.position(id);
  }

  citizenFear(id: string): number {
    return this.citizenState(id)?.fear ?? 0;
  }

  get heading(): number {
    return this.facing;
  }

  get isMoving(): boolean {
    return this.remainingPath.length > 0;
  }

  get remainingPath(): readonly Vec2[] {
    const pawn = this.world.get(this.pawnId);
    if (!pawn) return [];
    const route = (pawn.c as unknown as { route: Vec2[]; routeIndex: number });
    return route.route.slice(route.routeIndex);
  }

  get lastStepCount(): number {
    return this.lastSteps;
  }

  get remainingWaypoints(): number {
    return this.remainingPath.length;
  }

  /** Put everyone back at their post for the next shift. The Record survives. */
  resetBeat(): void {
    this.world.restore({ nextId: this.world.snapshot().nextId + 1, entities: [] });
    const [sx, sy] = this.mapJson.player_start;
    const start = this.map.toWorld(sx, sy);
    const pawn = this.world.create('pawn', {
      pos: { x: start.x, y: start.y },
      facing: 0,
      role: 'warden',
      route: [],
      routeIndex: 0,
    });
    this.pawnId = pawn.id;
    this.pos = { x: start.x, y: start.y };
    this.facing = 0;
    this.state.player.entityId = pawn.id;
    this.citizens.respawn();
    this.clock.setMode('pause');
  }

  /** 06:00 → 23:59, derived from sim time so it cannot drift from the clock. */
  get clockText(): string {
    const total = Math.min(SHIFT_LENGTH_SECONDS, this.clock.simSeconds);
    // 06:00 → 23:59 is 1,079 fiction minutes across the whole shift
    const minutes = Math.floor((total / SHIFT_LENGTH_SECONDS) * 1079);
    const h = 6 + Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get shiftOver(): boolean {
    return this.clock.simSeconds >= SHIFT_LENGTH_SECONDS;
  }

  /* -------------------------------------------------------------- commands */

  frame(): number {
    const steps = this.clock.frame();
    this.lastSteps = steps;
    if (this.phase === 'beat' && this.shiftOver) this.endBeat();
    return steps;
  }

  setMode(mode: TimeMode): void {
    this.clock.setMode(mode);
    this.bus.emit('clock:mode', { mode, timescale: this.clock.timescale });
  }

  beginBeat(): void {
    this.phase = 'beat';
    this.clock.setMode('patrol');
    this.bus.emit('shift:beat', { quota: this.quotaInspections });
  }

  moveTo(target: Vec2): { ok: true; waypoints: number } | { ok: false; reason: string } {
    const { tx, ty } = this.map.toTile(target);
    if (!this.map.isWalkable(tx, ty)) {
      this.bus.emit('nav:blocked', { target, reason: 'not_walkable' });
      return { ok: false, reason: 'That is inside a wall.' };
    }
    const path = findPath(this.map, this.pos, target, { radius: BODY_RADIUS * this.map.tileSize });
    if (!path.found || path.waypoints.length === 0) {
      this.bus.emit('nav:blocked', { target, reason: 'no_route' });
      return { ok: false, reason: 'No route.' };
    }
    const pawn = this.world.get(this.pawnId)!;
    const c = pawn.c as unknown as { route: Vec2[]; routeIndex: number };
    c.route = path.waypoints;
    c.routeIndex = 0;
    this.bus.emit('nav:ordered', { waypoints: path.waypoints.length });
    return { ok: true, waypoints: path.waypoints.length };
  }

  /* ----------------------------------------------------------- inspection */

  openInspection(citizenId: string): InspectionState | null {
    if (this.phase !== 'beat') return null;
    const def = this.citizens.def(citizenId);
    if (!def) return null;
    const checks = runChecksFor(def, this.state.shift);
    this.inspection = {
      citizenId,
      asked: [],
      transcript: [],
      checks,
      fullCheckDone: false,
      openedAtTick: this.clock.tick,
    };
    this.clock.setMode('focus');
    this.bus.emit('inspection:open', { citizen: citizenId });
    return this.inspection;
  }

  askQuestion(id: QuestionId): void {
    const insp = this.inspection;
    if (!insp) return;
    if (insp.asked.length >= MAX_QUESTIONS || insp.asked.includes(id)) return;
    const def = this.citizens.def(insp.citizenId);
    const q = QUESTIONS.find((x) => x.id === id);
    if (!def || !q) return;
    const answer = answerQuestion(
      { id: def.id, temperament: def.temperament, answers: def.true_answers, irregularity: def.irregularity },
      q,
      { asked: insp.asked, rng: this.rng },
    );
    insp.asked.push(id);
    insp.transcript.push({ id, question: answer.question, answer: answer.answer, tell: answer.tell });
    this.bus.emit('inspection:asked', { citizen: def.id, question: id, tell: answer.tell });
  }

  /** The slow, attention-drawing comparison of every field. */
  fullCheck(): void {
    const insp = this.inspection;
    if (!insp || insp.fullCheckDone) return;
    const def = this.citizens.def(insp.citizenId);
    if (!def) return;
    insp.fullCheckDone = true;
    insp.checks = runChecksFor(def, this.state.shift, true, sealDegrees(def));
    this.bus.emit('inspection:full_check', { citizen: def.id });
  }

  closeInspection(): void {
    this.inspection = null;
    this.clock.setMode('patrol');
  }

  /**
   * Finish an inspection with an outcome. This is where a decision becomes a
   * docket event with a truth attached — the *only* place truth is written.
   *
   * Note what does *not* happen here: no line is signed. The outcome decides
   * what actually happened, and the docket carries that as a draft. The line is
   * written at the desk, which is precisely where the player can still change
   * it — the lie the whole game is about lives in that gap.
   */
  resolveInspection(classification: Classification, opts: { bribe?: boolean } = {}): DocketEvent | null {
    const insp = this.inspection;
    if (!insp) return null;
    const def = this.citizens.def(insp.citizenId);
    if (!def) return null;

    const defective = def.irregularity !== null;
    const truth: Truth = {
      classification: defective ? 'C' : 'P',
      force_rung: classification === 'D' ? 3 : 2,
      detainees: classification === 'D' ? 1 : 0,
      casualties: 0,
      damage: 0,
      property: [
        ...(def.irregularity ? ['defective_papers'] : []),
        ...(opts.bribe ? ['bribe_taken'] : []),
      ],
      third_party_present: false,
      illegal_search: insp.fullCheckDone && !defective,
      bribe_taken: opts.bribe === true,
    };

    const cameras = this.camerasWatching(def.id);
    const witnesses = this.witnessesFor(def.id);
    const draft: Claim = {
      classification,
      force_rung: truth.force_rung as Claim['force_rung'],
      detainees: truth.detainees,
      casualties: 0,
      damage: 0,
    };

    const event: DocketEvent = {
      ref: def.id,
      kind: 'inspection',
      title: `${def.name} — ${def.archetype}`,
      note: defective
        ? `${def.papers.chip_serial} did not hold up under the checks.`
        : `The card held. ${def.name} answered every question I put to them.`,
      truth,
      subject: def.id,
      cameras,
      witnesses,
      quota: 1,
      draft,
      tags_hint: defective ? ['insufficient_papers'] : [],
    };

    this.docket.push(event);
    this.inspectionsDone += 1;
    this.inspection = null;
    this.clock.setMode('patrol');
    this.bus.emit('inspection:resolved', {
      citizen: def.id,
      classification,
      slack: slack(draft, truth),
      docket: this.docket.length,
    });

    if (this.inspectionsDone >= this.quotaInspections) {
      this.bus.emit('shift:quota_met', { inspections: this.inspectionsDone });
    }
    return event;
  }

  camerasWatching(citizenId: string): string[] {
    const pos = this.citizens.position(citizenId) ?? this.pos;
    const { tx, ty } = this.map.toTile(pos);
    return this.mapJson.cameras
      .filter((c) => tx >= c.x && tx < c.x + c.w && ty >= c.y && ty < c.y + c.h)
      .map((c) => c.id);
  }

  witnessesFor(citizenId: string): ReportLine['witnesses'] {
    const pos = this.citizens.position(citizenId) ?? this.pos;
    const out: ReportLine['witnesses'] = [];
    for (const def of this.citizens.all) {
      if (def.id === citizenId) continue;
      const p = this.citizens.position(def.id);
      if (!p) continue;
      if (Math.hypot(p.x - pos.x, p.y - pos.y) > 4 * this.map.tileSize) continue;
      out.push({
        id: def.id,
        reliability: 0.5 + def.dread * 0.4,
        will_talk: 0.25 + (def.temperament === 'helpful' ? 0.5 : 0) + (def.temperament === 'indignant' ? 0.3 : 0),
      });
    }
    return out.slice(0, 2);
  }

  /* ----------------------------------------------------------------- desk */

  openDesk(): void {
    this.phase = 'desk';
    this.clock.setMode('pause');
    // silence is a claim: anything in the docket that the player never files
    // gets an ai_auto line the moment the desk opens for submission
    this.bus.emit('desk:open', { docket: this.docket.length, quota: this.quotaInspections });
  }

  /** Live exposure for the gutter, given the player's current draft. */
  previewExposure(event: DocketEvent, draft: Claim): ExposureReport {
    return computeExposure({
      candidate: draft,
      truth: event.truth,
      cameras: event.cameras,
      witnesses: event.witnesses,
      contradictions: this.record.contradictionsFor({ claim: draft, witnesses: event.witnesses }),
    });
  }

  riskBandFor(event: DocketEvent, draft: Claim): ReturnType<typeof riskBand> {
    return riskBand(this.previewExposure(event, draft).risk_score);
  }

  /** File one docket card. Signing is final; the line cannot be edited after. */
  file(eventRef: string, entry: { claim: Claim; tags: string[]; free_text: string }): ReportLine | null {
    const event = this.docket.find((e) => e.ref === eventRef);
    if (!event) return null;
    if (this.record.query({ shift: this.state.shift }).some((l) => l.event_ref === eventRef && l.authority === 'self')) {
      this.bus.emit('desk:filed', { event_ref: eventRef, ignored: 'already_filed' });
      return null;
    }
    const exposure = this.previewExposure(event, entry.claim);
    const line = makeLine({
      id: this.record.nextId(this.state.shift),
      shift: this.state.shift,
      event_ref: event.ref,
      category: event.kind === 'inspection' ? 'inspection' : 'patrol',
      claim: entry.claim,
      truth: event.truth,
      witnesses: event.witnesses,
      tags: entry.tags,
      free_text: entry.free_text,
      exposure,
    });
    line.derived = { slack: slack(entry.claim, event.truth), caught: false, consequences: [] };
    this.record.append(line);
    this.bus.emit('desk:filed', {
      event_ref: eventRef,
      id: line.id,
      slack: line.derived.slack,
      band: riskBand(exposure.risk_score),
    });
    return line;
  }

  /** Submit the docket: audit, then the debrief. */
  submit(): AuditResult {
    const filedRefs = new Set(this.record.query({ shift: this.state.shift }).map((l) => l.event_ref));

    // anything unfiled becomes a hostile auto-filing, which is the point
    const auto: ReportLine[] = [];
    for (const event of this.docket) {
      if (filedRefs.has(event.ref)) continue;
      const truthLine = makeLine({
        id: 'tmp',
        shift: this.state.shift,
        event_ref: event.ref,
        category: 'inspection',
        claim: event.draft,
        truth: event.truth,
      });
      const line = autoFile(
        { ref: event.ref, shift: this.state.shift, cameras: event.cameras, truthLine },
        this.record.nextId(this.state.shift),
      );
      this.record.append(line);
      auto.push(line);
      this.bus.emit('desk:auto_filed', { event_ref: event.ref });
    }

    const lines = this.record.query({ shift: this.state.shift });
    const result = runAudit({
      lines,
      rngSeed: this.state.seed ^ (this.state.shift * 7919),
      autoFiled: auto,
    });
    for (const id of result.destabilised) this.record.destabilise([id]);

    this.lastAudit = result;
    this.phase = 'debrief';
    this.clock.setMode('pause');
    this.bus.emit('audit:done', {
      findings: result.findings.length,
      risk: result.review_risk,
      review: result.review,
    });
    return result;
  }

  /** Belief, for the debrief and for the next shift's briefing. */
  belief(): Belief {
    return this.record.belief();
  }

  /* ----------------------------------------------------------------- step */

  private step(dt: number): void {
    const pawn = this.world.get(this.pawnId);
    if (pawn) {
      const c = pawn.c as unknown as { pos: Vec2; facing: number; route: Vec2[]; routeIndex: number };
      const travel = SPEED_TILES_PER_SEC * this.map.tileSize * dt;
      if (c.routeIndex < c.route.length) {
        const wp = c.route[c.routeIndex]!;
        const dx = wp.x - c.pos.x;
        const dy = wp.y - c.pos.y;
        const d = Math.hypot(dx, dy);
        if (d <= travel) {
          c.pos.x = wp.x;
          c.pos.y = wp.y;
          c.routeIndex += 1;
          if (c.routeIndex >= c.route.length) {
            c.route = [];
            c.routeIndex = 0;
            this.bus.emit('nav:arrived', { x: Math.round(c.pos.x), y: Math.round(c.pos.y) });
          }
        } else {
          c.pos.x += (dx / d) * travel;
          c.pos.y += (dy / d) * travel;
          c.facing = Math.atan2(dy, dx);
        }
      }
      this.pos = { x: Math.round(c.pos.x * 1000) / 1000, y: Math.round(c.pos.y * 1000) / 1000 };
      this.facing = c.facing;
    }

    // citizens only move during the beat; at the desk the street is frozen
    if (this.phase === 'beat') this.citizens.step(dt, this.pos);

    if (this.phase === 'beat' && this.shiftOver) this.endBeat();

    if (this.clock.tick % 60 === 0) {
      this.bus.emit('shift:second', { clock: this.clockText, phase: this.phase });
    }
  }

  private endBeat(): void {
    if (this.phase !== 'beat') return;
    this.phase = 'desk';
    this.clock.setMode('pause');
    this.bus.emit('shift:end', { inspections: this.inspectionsDone, docket: this.docket.length });
    this.bus.emit('desk:open', { docket: this.docket.length, quota: this.quotaInspections });
  }

  /* ------------------------------------------------------- world plumbing */

  /** Used by Citizens; keeps the entity layout in one file. */
  addCitizen(id: string, components: Omit<CitizenComponents, 'citizenId'>): void {
    this.world.create('citizen', { citizenId: id, ...components });
  }

  removeCitizen(id: string): void {
    const e = this.world.ofKind('citizen').find((x) => (x.c as { citizenId: string }).citizenId === id);
    if (e) this.world.remove(e.id);
  }

  citizenState(id: string): CitizenComponents | undefined {
    const e = this.world.ofKind('citizen').find((x) => (x.c as { citizenId: string }).citizenId === id);
    return e ? (e.c as unknown as CitizenComponents) : undefined;
  }

  emit(type: string, payload: unknown): void {
    this.bus.emit(type, payload);
  }

  /* -------------------------------------------------------------- snapshot */

  snapshot(): GameState {
    this.state.world = this.world.snapshot();
    this.state.tick = {
      tick: this.clock.tick,
      simSeconds: this.clock.simSeconds,
      mode: this.clock.mode,
    };
    this.state.record = this.record.toJSON();
    this.state.rng = { warden: this.rng.state() };
    this.state.player.shiftSeconds = this.clock.simSeconds;
    return JSON.parse(JSON.stringify(this.state)) as GameState;
  }

  restore(state: GameState): void {
    this.world.restore(state.world);
    this.clock.restore(state.tick);
    this.rng.restore(state.rng['warden'] ?? this.rng.state());
    this.record.restore(state.record as ReportLine[]);
    Object.assign(this.state, state);
    this.bus.emit('shift:restored', { tick: state.tick.tick });
  }
}

/* --------------------------------------------------------------- helpers */

function runChecksFor(
  def: CitizenDef,
  shift: number,
  fullCheck = false,
  sealDegrees = 0,
): CheckResult[] {
  return runChecks(def.papers, { shift, fullCheck, sealDegrees });
}

/** A stable, seated seal rotation per citizen, so ±15° cannot flicker. */
function sealDegrees(def: CitizenDef): number {
  let h = 0;
  for (const ch of def.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const warped = def.irregularity?.field === 'name';
  return warped ? 16 + (h % 12) : (h % 29) - 14;
}

export { claimOf };
