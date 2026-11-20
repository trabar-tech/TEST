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
import type { Directive } from '@core/content';
import { satisfiedDirectives } from './directive-conflicts';
import {
  describeHome,
  homeFor,
  knownReason,
  type CitizenHome,
} from './citizen-homes';
import type { Grudge } from './plans';
import { newArbiter } from './directors';
import { temperature as temperatureOf, type SectorState } from './households';
import { forceIndexOf } from './sector';
import { pressureFromIndex } from './tactical/force';
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
import type { IncidentResult } from './tactical/incident';
import type { IncidentDocket } from './tactical/paperwork';
import {
  cardScene,
  draftFromIncident,
  highestRung,
  incidentTags,
  sceneNote,
  truthFromIncident,
} from './tactical/paperwork';
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

/** Docket scene facts → the (smaller) shape a filed line keeps. */
function docketSceneFacts(s: DocketScene): NonNullable<ReportLine['scene']> {
  return {
    entry: s.entry,
    roomsCleared: s.roomsCleared,
    roomsActuallyClear: s.roomsActuallyClear,
    loudestNoise: s.loudestNoise,
    heardByNeighbours: s.heardByNeighbours,
    damage: s.damage,
    wallsBreached: s.wallsBreached,
    unfound: s.unfound,
    stabilised: s.stabilised,
    unauthorisedForce: s.unauthorisedForce,
  };
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
  /**
   * Facts the scene produced that the desk may *show* but cannot let the player
   * edit: which door was used, how far the noise carried, who heard it. This is
   * the tactical layer leaking into the record (P2-T08) — the gutter reads it,
   * the form does not.
   */
  scene?: DocketScene;
  /**
   * The citizen's home in the district (P3-T02). Present only when the street is
   * bound to a sector, and always a *claim* — it is a record the Warden can look up,
   * not a hidden fact.
   */
  edge?: { household_id: string; line: string; discrepancy: string | null };
}

export interface DocketScene {
  entry: string;
  roomsCleared: number;
  roomsClaimed: number;
  roomsActuallyClear: number;
  loudestNoise: number;
  heardByNeighbours: number;
  damage: number;
  wallsBreached: number;
  unfound: number;
  stabilised: number;
  unauthorisedForce: boolean;
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
  /** standing orders in force tonight, for the contradiction test (P3-T11) */
  directives?: readonly Directive[];
  /**
   * The district behind the street (P3-T02). When supplied, every citizen has a
   * household record, and the Warden learns which one by inspecting them.
   */
  sector?: SectorState;
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
  /**
   * Grudges held against the Warden, by household (P3-T08). A grudge is a *record
   * with a cause*, never a rival: it changes who appears and why, and it decays.
   */
  grudges: Grudge[] = [];
  /** the Arbiter's pacing, kept here so the deck and the briefing read one source */
  arbiter: ReturnType<typeof newArbiter> | null = null;
  /** the Desk's fault vector, same reason */
  fault: Record<string, number> = {};
  /** flags and scheduled epilogues written by scenes and inspections */
  readonly effects: { flags: Record<string, boolean | number | string>; scheduled: Array<{ id: string; dueShift: number; cause: string }> } = { flags: {}, scheduled: [] };
  quotaInspections: number;
  inspectionsDone = 0;
  /** Standing orders for the shift; empty means the contradiction test does not fire */
  readonly liveDirectives: readonly Directive[];
  /** The district, when the street is bound to it; null in the pure Phase 1 slice */
  sector: SectorState | null;
  /** citizen id → the household they live in, resolved on first need */
  private readonly homes = new Map<string, CitizenHome | null>();

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
    this.liveDirectives = opts.directives ?? [];
    this.sector = opts.sector ?? null;

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

    // the street opens already carrying the district's mood, not a neutral one
    if (this.sector) this.citizens.setDreadLift(this.dreadLifts(this.sector));

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
  /**
   * Where a citizen lives. Resolved once and cached, because it must not change
   * between two looks at the same person in one shift.
   */
  homeOf(citizenId: string): CitizenHome | null {
    if (this.homes.has(citizenId)) return this.homes.get(citizenId) ?? null;
    const def = this.citizens.def(citizenId);
    const home = this.sector && def ? homeFor(this.sector, this.state.seed, def) : null;
    this.homes.set(citizenId, home);
    return home;
  }

  /**
   * Should this household now be Known? The sim doc's rule is two interactions or a
   * filed line naming them; `marked` is set when a line is filed for the event, so
   * the second inspection of the same person is what usually does it.
   */
  knownCandidate(citizenId: string): { householdId: string; reason: string } | null {
    const home = this.homeOf(citizenId);
    if (!home) return null;
    const inspections = this.inspectionCounts.get(citizenId) ?? 0;
    const filed = this.filedNames.has(citizenId);
    const reason = knownReason(home, inspections, filed);
    return reason ? { householdId: home.household_id, reason } : null;
  }

  private readonly inspectionCounts = new Map<string, number>();
  private readonly filedNames = new Set<string>();

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

    // the edge into the district: a citizen is a household, and the case file says so
    this.inspectionCounts.set(def.id, (this.inspectionCounts.get(def.id) ?? 0) + 1);
    const home = this.homeOf(def.id);
    if (home) {
      event.edge = {
        household_id: home.household_id,
        line: describeHome(home),
        discrepancy: home.discrepancy,
      };
      // the papers carry the home too, so the desk can show it without new plumbing
      event.note += ` They live in ${describeHome(home)}.`;
    }

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

  /* -------------------------------------------------------------- incident */

  /**
   * Record an incident in the docket. The tactical scene decides the facts; this
   * method only converts them into the same card shape the desk already renders,
   * so the player meets one kind of decision, not two.
   *
   * The draft is the honest one. Lying is an edit, which is the whole design.
   */
  addIncident(
    result: IncidentResult,
    opts: {
      ref: string;
      address: string;
      cameras?: string[];
      witnesses?: ReportLine['witnesses'];
      /**
       * The household the incident happened *at* (P3-T02). This is the hop that makes
       * recurrence mean something: the person in the briefing is behind the door you
       * just came through, and the desk can therefore charge the district for it.
       */
      householdId?: string;
    },
  ): DocketEvent {
    const truth = truthFromIncident(result);
    const scene: DocketScene = cardScene(result);
    const event: DocketEvent = {
      ref: opts.ref,
      kind: 'incident',
      title: opts.address,
      note: sceneNote(result, highestRung(result)),
      truth,
      cameras: opts.cameras ?? [],
      witnesses: opts.witnesses ?? [],
      quota: 1,
      draft: draftFromIncident(result),
      tags_hint: incidentTags(result),
      scene,
    };
    this.attachHousehold(event, opts.householdId);
    this.docket.push(event);
    this.bus.emit('incident:docketed', {
      event_ref: event.ref,
      rung: truth.force_rung,
      docket: this.docket.length,
    });
    return event;
  }

  /**
   * Record a crowd event. Same card shape, same desk, same audit — the crowd is
   * not a mini-game with its own economy, it is another thing you have to write up.
   */
  addCrowd(docket: IncidentDocket): DocketEvent {
    const event: DocketEvent = {
      ref: docket.ref,
      kind: 'incident',
      title: docket.title,
      note: docket.note,
      truth: docket.truth,
      cameras: docket.cameras,
      witnesses: docket.witnesses,
      quota: docket.quota,
      draft: docket.draft,
      tags_hint: docket.tags_hint,
      scene: docket.scene,
    };
    this.attachHousehold(event, docket.householdId);
    this.docket.push(event);
    // telemetry only, and from the *draft*: a systems file must not read `truth`
    // even to decorate an event (SYS-REC-01 §5.3, boundary rule 5)
    this.bus.emit('incident:docketed', {
      event_ref: event.ref,
      rung: docket.draft.force_rung,
      docket: this.docket.length,
    });
    return event;
  }

  /**
   * Bind a docket event to a household, in the same shape an inspection uses.
   *
   * Shared by both incident paths so the desk, the audit and the district reaction all
   * read one field. It is a *record the Warden can look up*, not a hidden fact: the
   * address on the card is the household's address.
   */
  private attachHousehold(event: DocketEvent, householdId: string | undefined): void {
    if (!householdId || !this.sector) return;
    const household = this.sector.households.find((h) => h.id === householdId);
    if (!household) return;
    const home: CitizenHome = {
      citizen_id: '',
      household_id: household.id,
      household,
      discrepancy: null,
    };
    event.edge = {
      household_id: household.id,
      line: describeHome(home),
      discrepancy: null,
    };
    event.title = `${event.title} — ${household.block.replace(/_/g, ' ')}`;
  }

  /** What the last incident produced, for the debrief and the case file. */
  get lastIncident(): IncidentResult | null {
    return this.incidentResult;
  }

  incidentResult: IncidentResult | null = null;

  /* ----------------------------------------------------------------- desk */

  openDesk(): void {
    this.phase = 'desk';
    this.clock.setMode('pause');
    // silence is a claim: anything in the docket that the player never files
    // gets an ai_auto line the moment the desk opens for submission
    this.bus.emit('desk:open', { docket: this.docket.length, quota: this.quotaInspections });
  }

  /** Live exposure for the gutter, given the player's current draft. */
  /**
   * The temperature the street reads (P3-T03): from the district when there is one, and
   * from the force ratchet when there is not. One number, so the barks, the deck and the
   * inspector cannot disagree about what kind of day it is.
   */
  streetTemperature(): number {
    if (this.sector) return temperatureOf(this.sector);
    return Math.round(pressureFromIndex(forceIndexOf(this.state)) * 100);
  }

  /** The Arbiter's state, for the deck's pacing fit. */
  arbiterState(): 'calm' | 'build' | 'peak' | 'release' {
    return this.arbiter?.state ?? 'calm';
  }

  /** The Desk's picture of the Warden, for the deck's fault alignment. */
  faultVector(): Record<string, number> {
    return { ...this.fault };
  }

  /** Epilogues and flags written by scenes and inspections, shared with the deck. */
  get effectState(): { flags: Record<string, boolean | number | string>; scheduled: Array<{ id: string; dueShift: number; cause: string }> } {
    return this.effects;
  }

  /** What the desk may show before signing, and nothing else. */
  directives(): readonly Directive[] {
    return this.liveDirectives;
  }

  /**
   * Tonight's orders. The Directorate issues them at the start of a shift, so they
   * are set from outside rather than re-read from content on every change.
   */
  /**
   * Replace the district. Called when the player's filings have changed it, so the
   * street and the Registry read the same households rather than snapshots of each
   * other.
   *
   * Recomputing the dread lift here is what makes the seam visible on the street: a
   * man whose household the Cell has recruited walks differently from one whose
   * household is quiet, without any new authored content.
   */
  setSector(sector: SectorState): void {
    this.sector = sector;
    this.homes.clear();
    this.citizens.setDreadLift(this.dreadLifts(sector));
  }

  /**
   * Household grievance → citizen dread. Floor at half the grievance, because a person
   * from an angry house is not *only* afraid — some of them are the anger — and cap at
   * 1. The authored `dread` stays as a base term inside `Citizens.effectiveDread`.
   */
  private dreadLifts(sector: SectorState): Map<string, number> {
    const lifts = new Map<string, number>();
    for (const citizen of this.citizens.all) {
      const home = homeFor(sector, this.state.seed, this.citizens.def(citizen.id) ?? undefined as never);
      const household = home ? sector.households.find((h) => h.id === home.household_id) : undefined;
      if (!household) continue;
      // a person from a hardened household is carrying something the neighbours can see;
      // the multiplier is small because it lands on top of an authored temperament
      const lift = household.flags.includes('available')
        ? Math.max(0.3, household.grievance * 0.55)
        : household.grievance * 0.35;
      lifts.set(citizen.id, Math.min(1, lift));
    }
    return lifts;
  }

  setDirectives(directives: readonly Directive[]): void {
    (this as { liveDirectives: readonly Directive[] }).liveDirectives = directives;
  }

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
      category: event.kind === 'inspection' ? 'inspection' : event.kind === 'incident' ? 'incident' : 'patrol',
      claim: entry.claim,
      truth: event.truth,
      witnesses: event.witnesses,
      tags: entry.tags,
      free_text: entry.free_text,
      exposure,
    });
    if (event.scene) line.scene = docketSceneFacts(event.scene);
    // filing a line that names someone is what makes them Known — the record, not
    // the act of walking past them, is what puts a person in the Warden's head
    if (event.subject) this.filedNames.add(event.subject);
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
      if (event.scene) line.scene = docketSceneFacts(event.scene);
    // filing a line that names someone is what makes them Known — the record, not
    // the act of walking past them, is what puts a person in the Warden's head
    if (event.subject) this.filedNames.add(event.subject);
      this.record.append(line);
      auto.push(line);
      this.bus.emit('desk:auto_filed', { event_ref: event.ref });
    }

    const lines = this.record.query({ shift: this.state.shift });
    const result = runAudit({
      lines,
      rngSeed: this.state.seed ^ (this.state.shift * 7919),
      autoFiled: auto,
      directives: this.liveDirectives.length > 0
        ? { live: this.liveDirectives, satisfied: satisfiedDirectives(this.liveDirectives, lines) }
        : undefined,
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
