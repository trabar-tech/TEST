/**
 * The audit — the game's antagonist and its feedback channel (SYS-REC-01 §5,
 * P1-T06).
 *
 * Three rules govern the implementation:
 *
 *  1. **Deterministic.** Given the same lines, exposure and RNG, the same result.
 *     No wall clock, no `Math.random`, no hidden state.
 *  2. **Never surprising.** Anything the audit can catch was already visible in
 *     the exposure gutter at filing time. The "no unexpected review" test in
 *     `tests/audit.test.ts` enforces this over 1,000 simulated filings.
 *  3. **Legible.** Every consequence names the line, the witness or camera, and
 *     the reason, in that order.
 */

import type { Rng } from '@core/rng';
import type { ReportLine, WitnessRef } from '@core/record';

export type FindingKind = 'camera' | 'witness' | 'contradiction' | 'pattern' | 'silence' | 'scene';

export interface Finding {
  kind: FindingKind;
  line_id: string;
  /** human-readable, and always specific: "cam:K4-2 saw the third man enter" */
  evidence: string;
  /** 0–1 */
  confidence: number;
  /** how much this finding adds to review risk */
  weight: number;
}

export interface AuditResult {
  findings: Finding[];
  /** summed review risk; >= 1.0 triggers a Compliance Review */
  review_risk: number;
  review: boolean;
  /** lines whose stability dropped, for the crack visual */
  destabilised: string[];
  /** plain-language summary lines for the stamped sheet, in the order to read them */
  sheet: string[];
}

export interface AuditOptions {
  lines: readonly ReportLine[];
  /** cameras that were in range per event, from the exposure report */
  rngSeed: number;
  /** peer test input: the player's mean slack over the last N shifts */
  history?: { meanSlack: number; lines: number };
  /** lines the audit had to file itself because the player filed nothing */
  autoFiled?: readonly ReportLine[];
}

/**
 * A witness comes forward with `will_talk × reliability × (1 − stability)`.
 * A fresh lie is more likely to be reported than an old one, which is the
 * mechanism that makes "cover it later" feel urgent rather than optional.
 */
export function witnessComesForward(w: WitnessRef, stability: number, rng: Rng): boolean {
  const p = Math.max(0, Math.min(1, w.will_talk * w.reliability * (1 - stability)));
  return rng.chance(p);
}

/**
 * Findings that come from the incident log rather than from a camera or a
 * witness. Weighted below a camera (0.2) and above a single slow witness (0.15)
 * because a door off its hinges is not a matter of who talks: it is a thing the
 * street saw happen.
 *
 * Deliberately only fires on *material* omissions, so an honest line never meets
 * this code path at all.
 */
function sceneFindings(line: ReportLine, rng: Rng): Finding[] {
  const scene = line.scene;
  if (!scene) return [];
  const out: Finding[] = [];
  const claim = line.claim;

  const declares = (token: string): boolean => claim.property?.includes(token) === true;

  // a neighbour's testimony about noise. An honest "nothing found, but the street
  // heard it" carries `third_party`; the finding is about the *omission*, not
  // about the noise. That distinction is what keeps this from punishing honesty.
  if (scene.heardByNeighbours > 0 && claim.classification === 'P' && !declares('third_party')) {
    if (rng.chance(0.75)) {
      out.push({
        kind: 'scene',
        line_id: line.id,
        evidence: `a neighbour heard ${scene.loudestNoise} tiles of noise from the street; the line says nothing happened`,
        confidence: 0.8,
        weight: 0.55,
      });
    }
  }

  // the door: damage is physical and survives the player's editing
  if (scene.damage >= 2 && claim.damage < 2) {
    out.push({
      kind: 'scene',
      line_id: line.id,
      evidence: `the door took ${scene.damage} points of damage; the line reports ${claim.damage}`,
      confidence: 1,
      weight: 0.45,
    });
  }

  // the man nobody found, and the room that was reported clear with him in it.
  // One finding, because they are one omission: the line says the job was done.
  if (claim.classification === 'P' && !declares('premises_not_fully_searched')) {
    const wrongClears = Math.max(0, scene.roomsCleared - scene.roomsActuallyClear);
    if (scene.unfound > 0 || wrongClears > 0) {
      out.push({
        kind: 'scene',
        line_id: line.id,
        evidence:
          wrongClears > 0
            ? `${wrongClears} room(s) were reported clear with a subject still in them`
            : `the premises were not fully searched; ${scene.unfound} subject(s) were never seen`,
        confidence: 0.9,
        weight: 0.2,
      });
    }
  }

  // unapproved lethal force
  if (scene.unauthorisedForce && claim.force_rung < 4) {
    out.push({
      kind: 'scene',
      line_id: line.id,
      evidence: 'lethal force was used without a field authorisation in the log',
      confidence: 1,
      weight: 0.9,
    });
  }

  return out;
}

/** The audit proper. */
export function runAudit(opts: AuditOptions): AuditResult {
  const findings: Finding[] = [];
  const destabilised: string[] = [];
  const rng = seedRng(opts.rngSeed);

  for (const line of opts.lines) {
    const honest = line.derived.slack === 0;

    // 1. Contradiction with a machine record. A camera that was in range and
    //    not blocked is decisive: 100%, by rule.
    const observed = line.exposure.cameras.length > 0 && !line.exposure.camera_blocked;
    if (!honest && observed) {
      findings.push({
        kind: 'camera',
        line_id: line.id,
        evidence: `${line.exposure.cameras[0]} was in range for the whole of it`,
        confidence: 1,
        weight: 0.2,
      });
      destabilised.push(line.id);
    }

    // 2. Witness test. Only witnesses *the player was shown* can speak; the
    //    gutter already named them, so this can never be a surprise.
    if (!honest) {
      for (const w of line.witnesses) {
        if (!witnessComesForward(w, line.stability, rng)) continue;
        findings.push({
          kind: 'witness',
          line_id: line.id,
          evidence: `${w.id} was in the room and has been brought in`,
          confidence: Math.min(1, w.reliability * w.will_talk + 0.2),
          weight: 0.15,
        });
        destabilised.push(line.id);
        break; // one witness is enough for the sheet; the rest is texture
      }
    }

    // 2b. The scene test (P2): the tactical layer's own log is a machine record.
    //     A neighbour who heard the ram, a door that came off its frame, a man
    //     nobody found — these are facts the incident produced and the player
    //     cannot edit at the desk. They are the tactical layer's contribution to
    //     the record, and the reason a raid cannot be filed as a quiet walk.
    const scene = sceneFindings(line, rng);
    for (const f of scene) {
      findings.push(f);
      if (!destabilised.includes(line.id)) destabilised.push(line.id);
    }

    // 3. Contradictions with the player's own earlier lines.
    for (const other of line.exposure.contradictions) {
      findings.push({
        kind: 'contradiction',
        line_id: line.id,
        evidence: `contradicts ${other}, filed earlier in the same shift`,
        confidence: 0.9,
        weight: 0.15,
      });
      if (!destabilised.includes(line.id)) destabilised.push(line.id);
    }
  }

  // 4. Peer pattern test: a supervisor compares this shift against the record.
  const pattern = peerPattern(opts.lines, opts.history);
  if (pattern) findings.push(pattern);

  // 5. Silence: the audit files for you, uncharitably. This is a line, not a
  //    finding — but it must appear on the sheet as a hostile act.
  for (const auto of opts.autoFiled ?? []) {
    findings.push({
      kind: 'silence',
      line_id: auto.id,
      evidence: 'no line was filed; the audit wrote one from the camera log',
      confidence: 1,
      weight: 0.1,
    });
  }

  const review_risk =
    Math.round(findings.reduce((a, f) => a + f.weight, 0) * 1000) / 1000;
  return {
    findings,
    review_risk,
    review: review_risk >= 1,
    destabilised: [...new Set(destabilised)],
    sheet: buildSheet(findings, review_risk),
  };
}

/**
 * Consistent small lies are safer than one large one, and a clean record makes
 * a sudden lie louder. This is the only rule that looks *across* shifts, and it
 * is deliberately gentle: it is a nudge, not a trap.
 */
function peerPattern(
  lines: readonly ReportLine[],
  history?: { meanSlack: number; lines: number },
): Finding | null {
  if (!history || history.lines < 2) return null;
  const worst = [...lines].sort((a, b) => b.derived.slack - a.derived.slack)[0];
  if (!worst) return null;
  const jump = worst.derived.slack - history.meanSlack;
  if (jump < 0.35) return null;
  return {
    kind: 'pattern',
    line_id: worst.id,
    evidence: `your filings this shift sit ${Math.round(jump * 100)} points above your own average`,
    confidence: 0.6,
    weight: 0.1,
  };
}

function buildSheet(findings: Finding[], risk: number): string[] {
  const order: FindingKind[] = ['camera', 'witness', 'contradiction', 'silence', 'pattern'];
  const byKind = new Map<FindingKind, Finding[]>();
  for (const f of findings) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }
  const sheet: string[] = [];
  for (const kind of order) {
    for (const f of byKind.get(kind) ?? []) {
      sheet.push(`${label(kind)} — ${f.line_id}: ${f.evidence}.`);
    }
  }
  if (risk >= 1) sheet.push('REVIEW — this shift is referred to Compliance. Expect a harder audit.');
  else if (risk >= 0.5) sheet.push('NOTED — the sheet is marked. Nothing follows from it tonight.');
  else sheet.push('CLEARED — nothing on this sheet was queried.');
  return sheet;
}

function label(kind: FindingKind): string {
  switch (kind) {
    case 'camera':
      return 'CAMERA';
    case 'witness':
      return 'WITNESS';
    case 'contradiction':
      return 'CONTRADICTION';
    case 'pattern':
      return 'PATTERN';
    case 'silence':
      return 'SILENCE';
    case 'scene':
      return 'THE SCENE';
  }
}

/** The audit must be reproducible; this is its only source of randomness. */
function seedRng(seed: number): Rng {
  // local import-free copy of the mulberry32 contract, so the audit cannot
  // accidentally hold a shared stream position
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    nextU32: () => Math.floor(next() * 4294967296),
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items, weight) => {
      const total = items.reduce((s, i) => s + weight(i), 0);
      let r = next() * total;
      for (const i of items) {
        r -= weight(i);
        if (r <= 0) return i;
      }
      return items[items.length - 1];
    },
    state: () => a,
    restore: (s: number) => {
      a = s >>> 0;
    },
  };
}

/**
 * The `ai_auto` filing: what the Directorate writes when the player writes
 * nothing. Least charitable reading, from machine records only.
 */
export function autoFile(
  event: { ref: string; shift: number; cameras: string[]; truthLine: ReportLine },
  id: string,
): ReportLine {
  const t = event.truthLine.truth;
  return {
    ...event.truthLine,
    id,
    shift: event.shift,
    event_ref: event.ref,
    authority: 'ai_auto',
    stability: 1,
    lifespan: 6,
    free_text: '',
    tags: [],
    claim: {
      // the least charitable reading of the same facts
      classification: t.classification === 'P' ? (t.third_party_present ? 'R' : 'C') : t.classification,
      force_rung: Math.max(t.force_rung, 3) as ReportLine['claim']['force_rung'],
      detainees: t.detainees,
      casualties: t.casualties,
      damage: t.damage,
    },
    derived: { slack: 0, caught: false, consequences: ['auto_filed'] },
    exposure: {
      cameras: [...event.cameras],
      camera_blocked: false,
      witnesses: [],
      contradictions: [],
      risk_score: 0,
    },
  };
}
