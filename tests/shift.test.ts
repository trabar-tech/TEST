/**
 * The Phase 1 loop, end to end and headless:
 * briefing → beat → inspections → docket → desk filing → audit → debrief.
 *
 * This is the test that protects G0: if this loop cannot be driven to completion
 * in code, no amount of UI makes the phase real.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileMap } from '@core/nav';
import { claimOf, slack } from '@core/record';
import { mapJsonToDef, type MapJson } from '../scripts/lib/load-content';
import { Simulation, SHIFT_LENGTH_SECONDS, type CitizenFile, type MapJsonSlice } from '@systems/shift';
import { QUESTIONS } from '@systems/inspection';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/maps/kiln_row_slice.json'), 'utf8'),
) as MapJson & MapJsonSlice;
const citizensJson = JSON.parse(
  readFileSync(resolve(__dirname, '../content/examples/citizens.slice.json'), 'utf8'),
) as CitizenFile;

function makeSim(over: { seed?: number; quota?: number } = {}) {
  return new Simulation({
    seed: over.seed ?? 42,
    shift: 1,
    map: new TileMap(mapJsonToDef(mapJson)),
    mapJson,
    citizens: citizensJson,
    ...(over.quota === undefined ? {} : { quotaInspections: over.quota }),
  });
}

/** run the beat for n sim-seconds through 60 Hz frames */
function beat(sim: Simulation, seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    sim.clock.advanceRealMs(1000 / 60);
    if (sim.shiftOver) break;
  }
}

/** Find the one citizen with a defect, and the clean ones, by their content. */
const defective = citizensJson.citizens.filter((c) => c.irregularity !== null);
const clean = citizensJson.citizens.filter((c) => c.irregularity === null);

describe('the street', () => {
  it('spawns every citizen on a walkable tile', () => {
    const sim = makeSim();
    for (const def of citizensJson.citizens) {
      const pos = sim.citizens.position(def.id);
      expect(pos, def.id).toBeDefined();
      const t = sim.map.toTile(pos!);
      expect(sim.map.isWalkable(t.tx, t.ty), def.id).toBe(true);
    }
  });

  it('citizens go about their routines once the beat starts', () => {
    const sim = makeSim();
    sim.beginBeat();
    const before = citizensJson.citizens.map((c) => ({ ...sim.citizens.position(c.id)! }));
    beat(sim, 40);
    const moved = citizensJson.citizens.filter((c, i) => {
      const p = sim.citizens.position(c.id)!;
      return Math.hypot(p.x - before[i]!.x, p.y - before[i]!.y) > 8;
    });
    expect(moved.length).toBeGreaterThanOrEqual(2);
  });

  it('citizens never end up inside a wall while walking', () => {
    const sim = makeSim();
    sim.beginBeat();
    for (let i = 0; i < 60 * 60; i++) {
      sim.clock.advanceRealMs(1000 / 60);
      if (i % 20 === 0) {
        for (const def of citizensJson.citizens) {
          const p = sim.citizens.position(def.id)!;
          const t = sim.map.toTile(p);
          expect(sim.map.isWalkable(t.tx, t.ty), `${def.id} at ${t.tx},${t.ty}`).toBe(true);
        }
      }
    }
  });

  it('dread changes behaviour: a frightened citizen backs off', () => {
    const sim = makeSim();
    sim.beginBeat();
    // stand in the middle of the crossroads and let the neighbourhood notice
    beat(sim, 120);
    const fears = citizensJson.citizens.map((c) => sim.citizenState(c.id)!.fear);
    // someone on this street is more afraid than the calmest one
    expect(Math.max(...fears) - Math.min(...fears)).toBeGreaterThan(0.15);
  });
});

/**
 * Walk to a citizen and open the inspection, the way a player does.
 *
 * Reach is enforced in `openInspection` (first-playtest fix), so a test that teleports the
 * Warden is no longer testing the game. This is the honest path: set a route, run the beat,
 * and arrive.
 */
function talkTo(sim: Simulation, id: string): void {
  for (let i = 0; i < 60 * 60 && sim.reachCheck(id) !== null; i++) {
    if (!sim.approaching) sim.approachAndInspect(id);
    sim.clock.advanceRealMs(1000 / 60);
    if (sim.shiftOver) break;
  }
  sim.openInspection(id);
}

describe('inspection', () => {
  it('opens only during the beat, and slows time while it is open', () => {
    const sim = makeSim();
    expect(sim.openInspection('c-0221')).toBeNull();
    sim.beginBeat();
    talkTo(sim, 'c-0221');
    expect(sim.inspection).not.toBeNull();
    expect(sim.clock.pendingMode).toBe('focus');
  });

  it('offers exactly three answers, and refuses a fourth', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0307');
    for (const q of ['shift_boss', 'pass_line3', 'hands'] as const) sim.askQuestion(q);
    expect(sim.inspection!.transcript).toHaveLength(3);
    sim.askQuestion('rations');
    expect(sim.inspection!.transcript).toHaveLength(3);
    // asking the same one twice does nothing either
    sim.askQuestion('shift_boss');
    expect(sim.inspection!.transcript).toHaveLength(3);
  });

  it('a follow-up cannot be asked before it is opened', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0307');
    // `again_slower` opens on any answer, `who_else_knows` needs neighbours or a gate
    expect(sim.openQuestions().map((q) => q.id)).not.toContain('who_else_knows');
    sim.askQuestion('who_else_knows');
    expect(sim.inspection!.transcript).toHaveLength(0);
  });

  it('a tell is a property of one line, not a whole person', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0414');
    // over many seeds and many answers, some lines leak and some do not: a person who is
    // *entirely* smooth is a stat, and a single smooth sentence is something to notice
    let leaks = 0;
    let quiet = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s2 = makeSim();
      s2.beginBeat();
      talkTo(s2, 'c-0414');
      for (const q of ['shift_boss', 'pass_line3', 'hands'] as const) s2.askQuestion(q);
      for (const line of s2.inspection!.transcript) line.tell ? leaks++ : quiet++;
      void seed;
    }
    expect(leaks).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(0);
  });

  it('the full check is what reveals a warped seal', () => {
    const sim = makeSim();
    sim.beginBeat();
    const warped = citizensJson.citizens.find((c) => c.irregularity?.field === 'name')!;
    talkTo(sim, warped.id);
    expect(sim.inspection!.checks.some((c) => c.id === 'seal_warp')).toBe(false);
    sim.fullCheck();
    const seal = sim.inspection!.checks.find((c) => c.id === 'seal_warp')!;
    expect(seal.pass).toBe(false);
  });

  it('an inspection writes no line by itself: the desk signs it', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0307'); // clean papers
    const event = sim.resolveInspection('P');
    expect(event).not.toBeNull();
    expect(sim.record.size).toBe(0);
    expect(sim.docket).toHaveLength(1);
  });

  it('an honest filing has zero slack', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0307'); // clean papers
    sim.resolveInspection('P');
    sim.openDesk();
    const e = sim.docket[0]!;
    const line = sim.file(e.ref, { claim: claimOf(e.truth), tags: [], free_text: '' })!;
    expect(line.derived.slack).toBe(0);
    expect(slack(line.claim, line.truth)).toBe(0);
  });

  it('detaining someone who did nothing is a lie the record keeps', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0307');
    sim.resolveInspection('D');
    sim.openDesk();
    const e = sim.docket[0]!;
    // the truth is "detained", so an honest filing of D is clean...
    const honest = sim.file(e.ref, { claim: claimOf(e.truth), tags: [], free_text: '' })!;
    expect(honest.derived.slack).toBe(0);
    expect(honest.claim.detainees).toBe(1);

    // ...and passing them is a lie, because the detention is in the world. It is
    // a *free* lie only if nobody saw it, which is the whole bargain.
    const passed = sim.previewExposure(e, { ...claimOf(e.truth), classification: 'P', detainees: 0 });
    expect(slack({ ...claimOf(e.truth), classification: 'P', detainees: 0 }, e.truth)).toBeGreaterThan(0);
    expect(passed.risk_score).toBe(e.cameras.length > 0 || e.witnesses.length > 0 ? passed.risk_score : 0);
    if (e.cameras.length === 0 && e.witnesses.length === 0) {
      expect(passed.risk_score).toBe(0); // unseen, and therefore safe to deny
    }
  });

  it('a camera over the inspection shows up in the filing preview', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0414'); // ration queue: annex-1 covers it
    expect(sim.docket).toHaveLength(0); // nothing is signed until the desk
    sim.resolveInspection('P'); // the player missed the expired pass
    const ev = sim.docket[0]!;
    expect(ev.cameras.length).toBeGreaterThan(0);
    // the truth is a citation; writing "pass" under a camera is not a safe bet
    // claiming the violation is clean...
    expect(sim.riskBandFor(ev, claimOf(ev.truth))).toBe('safe');
    // ...but the player's own draft says "pass", and the camera saw the line.
    // 0.35 slack × 1.5 watched = 0.525: one band above the line, not three.
    // The gutter's job is to be honest, not theatrical.
    expect(ev.draft.classification).toBe('P');
    expect(sim.riskBandFor(ev, { ...claimOf(ev.truth), classification: 'P' })).toBe('hanging');
    expect(sim.riskBandFor(ev, { ...claimOf(ev.truth), classification: 'P' })).toBe('hanging');
  });
});

describe('the desk', () => {
  function withDocket(): Simulation {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0221'); // defective chip
    sim.resolveInspection('P'); // the player misses it
    talkTo(sim, 'c-0307'); // clean
    sim.resolveInspection('P');
    sim.openDesk();
    return sim;
  }

  it('freezes the street and stops the clock', () => {
    const sim = withDocket();
    expect(sim.phase).toBe('desk');
    const tick = sim.clock.tick;
    beat(sim, 3);
    expect(sim.clock.tick).toBe(tick);
  });

  it('previews exposure before signing, and the preview matches what is filed', () => {
    const sim = withDocket();
    const event = sim.docket[0]!;
    const draft = { ...event.draft, classification: 'P' as const };
    const preview = sim.previewExposure(event, draft);
    const line = sim.file(event.ref, { claim: draft, tags: [], free_text: '' })!;
    expect(line.exposure.risk_score).toBe(preview.risk_score);
  });

  it('lets a player see nothing, and then the audit files for them', () => {
    const sim = withDocket();
    const result = sim.submit();
    // nobody filed: two auto-filings, both hostile
    const auto = sim.record.query({ authority: 'ai_auto' });
    expect(auto.length).toBe(2);
    expect(result.sheet.some((s) => s.startsWith('SILENCE'))).toBe(true);
  });

  it('a filed docket audits to what the gutter promised', () => {
    const sim = withDocket();
    const clean = sim.docket.find((e) => e.subject === 'c-0307')!;
    sim.file(clean.ref, { claim: claimOf(clean.truth), tags: [], free_text: '' });
    const result = sim.submit();
    // the unfiled defective one is caught by silence, not by a surprise
    const silent = result.findings.filter((f) => f.kind === 'silence');
    expect(silent).toHaveLength(1);
    expect(silent[0]!.line_id).toBeTruthy();
    expect(result.findings.filter((f) => f.kind === 'witness')).toHaveLength(0);
  });

  it('refuses to file the same event twice', () => {
    const sim = withDocket();
    const e = sim.docket[0]!;
    expect(sim.file(e.ref, { claim: claimOf(e.truth), tags: [], free_text: '' })).not.toBeNull();
    expect(sim.file(e.ref, { claim: claimOf(e.truth), tags: [], free_text: '' })).toBeNull();
  });

  it('clips free text to 240 characters instead of rejecting it', () => {
    const sim = withDocket();
    const e = sim.docket[0]!;
    const line = sim.file(e.ref, { claim: claimOf(e.truth), tags: [], free_text: 'x'.repeat(400) })!;
    expect(line.free_text).toHaveLength(240);
  });
});

describe('the day turns', () => {
  it('the shift clock runs 06:00 to 23:59 and then closes the beat', () => {
    const sim = makeSim();
    sim.beginBeat();
    expect(sim.clockText).toBe('06:00');
    beat(sim, SHIFT_LENGTH_SECONDS + 2);
    expect(sim.phase).toBe('desk');
    expect(sim.clockText).toBe('23:59');
  });

  it('the audit review risk carries a verdict the debrief can read', () => {
    const sim = makeSim();
    sim.beginBeat();
    // the ration queue is under annex-1, so anything written there is observed
    talkTo(sim, 'c-0414');
    sim.resolveInspection('C');
    sim.openDesk();
    const ev = sim.docket[0]!;
    expect(ev.cameras.length).toBeGreaterThan(0);
    // lie on the form: an expired pass, written up as a pass
    sim.file(ev.ref, {
      claim: { ...claimOf(ev.truth), classification: 'P' },
      tags: [],
      free_text: '',
    });
    const result = sim.submit();
    expect(result.findings.some((f) => f.kind === 'camera')).toBe(true);
    expect(result.sheet.length).toBeGreaterThan(0);
  });

  it('belief is readable after a shift and counts claims only', () => {
    const sim = makeSim();
    sim.beginBeat();
    talkTo(sim, 'c-0221'); // defective chip, seen by nobody
    sim.resolveInspection('C');
    sim.openDesk();
    const e = sim.docket[0]!;
    sim.file(e.ref, { claim: { ...claimOf(e.truth), classification: 'R', force_rung: 4 }, tags: ['cell'], free_text: '' });
    sim.submit();
    const belief = sim.belief();
    expect(belief.resistance_estimate).toBe(1);
    expect(belief.brutality_index).toBe(1);
    expect(belief.lines).toBe(1);
  });
});

/** The smallest honest IncidentResult the docket path accepts. */
const honestResult = () =>
  ({
    roomClaims: [{ room: 'north', claimedClear: true, actuallyClear: true }],
    forceUsed: [],
    damage: 0,
    detainees: 0,
    casualties: 0,
    noiseEvents: 1,
    loudestNoise: 1,
    heardByNeighbours: 0,
    wallsBreached: 0,
    entryMethod: 'knock_talk' as const,
    unauthorisedForce: false,
    stabilised: [],
    unfound: [],
    soloHits: 0,
    ticksElapsed: 40,
  }) as never;

describe('an incident the Warden never wrote a line for is still charged for (P3-T02)', () => {
  it('keeps the auto-filed lines so the district can react to them', () => {
    const sim = makeSim();
    sim.addIncident(honestResult(), { ref: 'int-1-1', address: 'Block C', cameras: [], householdId: 'h-001' });
    // no line filed for int-1-1: submit() writes one itself
    expect(sim.lastAutoFiled).toEqual([]);
    sim.submit();
    expect(sim.lastAutoFiled).toHaveLength(1);
    expect(sim.lastAutoFiled[0]!.event_ref).toBe('int-1-1');
    // and it is filed by the desk (`ai_auto`), not by the Warden
    expect(sim.lastAutoFiled[0]!.authority).toBe('ai_auto');
  });

  it('keeps the household id even with no district loaded, so the raid is not free', () => {
    const sim = makeSim();
    sim.addIncident(honestResult(), { ref: 'int-1-1', address: 'Block C', cameras: [], householdId: 'h-004' });
    expect(sim.docket[0]!.edge?.household_id).toBe('h-004');
  });
});
