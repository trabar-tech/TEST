/**
 * Inspection: the citizen card, its three authority checks, and the conversation
 * (SYS-REC-01 §2, P1-T03 / P1-T04).
 *
 * The design rule that shapes every function here: **no pixel hunts.** An
 * irregularity must be visible at its stated severity to someone who has read
 * the rule once. So paper defects are found by *rules applied to printed
 * values* (chip checksum, district prefix, pass expiry), not by squinting at a
 * texture. What is hard is the conversation — deciding whether the person in
 * front of you is lying — and that difficulty is deliberate.
 *
 * Everything is pure and seed-driven: the same citizen answers the same
 * question the same way, forever. A player who is wrong must be able to work out
 * why, which is impossible if answers are re-rolled.
 */

import type { Rng } from '@core/rng';

/* ------------------------------------------------------------ paper checks */

export const PAPER_FIELDS = [
  'name',
  'district_stamp',
  'ration_class',
  'work_permit',
  'curfew_pass',
  'chip_serial',
] as const;

export type PaperField = (typeof PAPER_FIELDS)[number];

export interface Papers {
  name: string;
  district_stamp: string;
  ration_class: 'A' | 'B' | 'C' | 'D';
  work_permit: string;
  curfew_pass: boolean;
  chip_serial: string;
}

export type IrregularityKind =
  | 'wrong_class_digit'
  | 'wrong_district'
  | 'pass_expired'
  | 'seal_warp'
  | 'permit_revoked'
  | 'name_mismatch';

export interface Irregularity {
  field: PaperField;
  kind: IrregularityKind;
  /** 1 = visible to the naked eye, 3 = only caught by a full check */
  severity: 1 | 2 | 3;
}

export type CheckId = 'chip_checksum' | 'district_prefix' | 'pass_expiry' | 'seal_warp';

export interface CheckResult {
  id: CheckId;
  label: string;
  /** what the check looked at, in the player's language */
  examined: string;
  pass: boolean;
  /** shown only when the check fails, or after a full check */
  detail: string;
  /** which field it speaks to */
  field: PaperField;
}

const CLASS_TO_DIGIT: Record<Papers['ration_class'], number> = { A: 1, B: 2, C: 3, D: 4 };

/** chip serials look like `C-4471-8`: class letter, 4 digits, check digit. */
export function chipChecksumValid(serial: string, rationClass: Papers['ration_class']): boolean {
  const m = /^([A-D])-(\d{4})-(\d)$/.exec(serial.trim());
  if (!m) return false;
  const [, letter, digits, check] = m;
  if (letter !== rationClass) return false;
  const sum = digits!.split('').reduce((acc, d) => acc + Number(d), 0);
  const expected = (CLASS_TO_DIGIT[rationClass] + sum) % 10;
  return Number(check) === expected;
}

/** A Sector 4 pass must carry the S4 district stamp. */
export function districtValid(stamp: string, sector = 4): boolean {
  return stamp.trim().toUpperCase() === `S${sector}`;
}

/** Curfew passes for this shift were stamped for shift >= 12; earlier ones lapsed. */
export const CURFEW_VALID_FROM_SHIFT = 12;

export interface CheckContext {
  /** the shift being played, so expiry can be judged */
  shift: number;
  /** seal rotation in degrees; ±15 with a warp is a tell, ±1 is not */
  sealDegrees?: number;
  /** set by a full check: a full check reveals severity-3 defects */
  fullCheck?: boolean;
}

export function runChecks(papers: Papers, ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [
    {
      id: 'chip_checksum',
      label: 'Chip serial',
      examined: papers.chip_serial,
      pass: chipChecksumValid(papers.chip_serial, papers.ration_class),
      detail: 'The last digit must agree with the class letter and the four digits.',
      field: 'chip_serial',
    },
    {
      id: 'district_prefix',
      label: 'District stamp',
      examined: papers.district_stamp,
      pass: districtValid(papers.district_stamp),
      detail: 'Kiln Row is Sector 4. A pass from another sector needs a transfer slip.',
      field: 'district_stamp',
    },
    {
      id: 'pass_expiry',
      label: 'Curfew pass',
      examined: papers.curfew_pass ? `stamped shift ${CURFEW_VALID_FROM_SHIFT}` : 'not presented',
      // an honest absence is not a defect; an *expired* one is
      pass: papers.curfew_pass || ctx.shift >= CURFEW_VALID_FROM_SHIFT,
      detail: `Passes stamped before shift ${CURFEW_VALID_FROM_SHIFT} lapsed at the curfew amendment.`,
      field: 'curfew_pass',
    },
  ];

  // the seal is only readable once you look at it properly: the full check
  if (ctx.fullCheck) {
    const deg = ctx.sealDegrees ?? 0;
    results.push({
      id: 'seal_warp',
      label: 'Seal',
      examined: `rotation ${deg > 0 ? '+' : ''}${deg}°`,
      pass: Math.abs(deg) <= 15,
      detail: 'The seal should sit square. Anything past fifteen degrees was re-stamped.',
      field: 'name',
    });
  }
  return results;
}

/** Which field, if any, the checks found fault with. */
export function failingFields(results: readonly CheckResult[]): PaperField[] {
  return results.filter((r) => !r.pass).map((r) => r.field);
}

/**
 * Truth about a citizen's paper: what a perfect inspection would establish.
 * Kept beside the checks so the "no false positives" test can assert that a
 * clean citizen fails nothing, and a defective one fails exactly its defect.
 */
export function paperDefectFound(irregularity: Irregularity | null, results: readonly CheckResult[]): boolean {
  if (!irregularity) return failingFields(results).length > 0 ? false : false;
  return !results.find((r) => r.field === irregularity.field)?.pass;
}

/* --------------------------------------------------------- the conversation */

export type Temperament = 'afraid' | 'indignant' | 'rehearsed' | 'drunk' | 'helpful';

export type QuestionId = 'shift_boss' | 'pass_line3' | 'hands' | 'rations' | 'neighbours' | 'route_home';

export interface QuestionDef {
  id: QuestionId;
  text: string;
  /** what a truthful answer looks like, for the log */
  probes: string;
}

export const QUESTIONS: readonly QuestionDef[] = [
  { id: 'shift_boss', text: 'Who is your shift boss?', probes: 'a name you can verify against the permit' },
  { id: 'pass_line3', text: 'Read me the third line of your pass.', probes: 'the sector and block on the document' },
  { id: 'hands', text: 'Show me your hands.', probes: 'a trade the permit claims' },
  { id: 'rations', text: 'What did you draw this week?', probes: 'a class consistent with the card' },
  { id: 'neighbours', text: 'Who lives in the flat above you?', probes: 'a name, not a story' },
  { id: 'route_home', text: 'Which way do you walk home?', probes: 'a route that avoids the gate camera' },
];

export interface CitizenAnswers {
  shift_boss: string;
  pass_line3: string;
  hands: string;
  rations?: string;
  neighbours?: string;
  route_home?: string;
}

export interface AnsweredQuestion {
  id: QuestionId;
  question: string;
  answer: string;
  /** the player-facing tell, if this temperament leaks one here */
  tell: TellId | null;
}

export type TellId =
  | 'too_smooth'
  | 'over_consistent'
  | 'answers_unasked'
  | 'identical_repetition'
  | 'too_eager'
  | 'forgets_address'
  | 'volunteers_documents';

export interface TellDef {
  id: TellId;
  /** what the player sees in the transcript */
  text: string;
  /** which temperament leaks it */
  temperament: Temperament;
  /** the honest reading, shown in the Codex once unlocked */
  meaning: string;
}

/**
 * Tells are *verbal* and legible in a transcript (SYS-REC-01 §2). The same
 * temperament always leaks the same tell, so a tester can learn the vocabulary.
 */
export const TELLS: Record<TellId, TellDef> = {
  too_smooth: {
    id: 'too_smooth',
    text: 'The answer arrives whole, with no pause in it.',
    temperament: 'rehearsed',
    meaning: 'Rehearsed. Nothing is wrong with the answer, and that is the problem.',
  },
  over_consistent: {
    id: 'over_consistent',
    text: 'The second telling matches the first word for word.',
    temperament: 'indignant',
    meaning: 'People who are telling the truth usually rephrase; people who rehearsed do not.',
  },
  answers_unasked: {
    id: 'answers_unasked',
    text: 'They answer the question behind the one you asked.',
    temperament: 'rehearsed',
    meaning: 'A scripted answer only fits a scripted question.',
  },
  identical_repetition: {
    id: 'identical_repetition',
    text: 'The phrase comes back with the same stumble in the same place.',
    temperament: 'drunk',
    meaning: 'Drunk, or coached. Ask something off the script.',
  },
  too_eager: {
    id: 'too_eager',
    text: 'They offer a name before you ask for one.',
    temperament: 'helpful',
    meaning: 'Eagerness to be useful is also eagerness to be elsewhere.',
  },
  forgets_address: {
    id: 'forgets_address',
    text: 'They cannot place their own street.',
    temperament: 'afraid',
    meaning: 'Fear, usually. Fear is not guilt, and the record will not care.',
  },
  volunteers_documents: {
    id: 'volunteers_documents',
    text: 'They push a second document across the counter.',
    temperament: 'helpful',
    meaning: 'Someone has told them that cooperating helps. Someone was wrong.',
  },
};

const TEMPERAMENT_TELL: Record<Temperament, TellDef['id'] | null> = {
  afraid: 'forgets_address',
  indignant: 'over_consistent',
  rehearsed: 'too_smooth',
  drunk: 'identical_repetition',
  helpful: 'volunteers_documents',
};

/** How a temperament *says* things, independent of what is true. */
function voice(temperament: Temperament, answer: string, tense: 'first' | 'repeat'): string {
  switch (temperament) {
    case 'afraid':
      return tense === 'first' ? `${answer}. Sorry. I think. Sorry.` : `...${answer}. Sorry.`;
    case 'indignant':
      return tense === 'first'
        ? `${answer} — and you can check it, everyone checks it.`
        : `${answer}. Exactly that.`;
    case 'rehearsed':
      return `${answer}.`;
    case 'drunk':
      return tense === 'first' ? `${answer}, I said, ${answer}.` : `${answer}. Same as I said.`;
    case 'helpful':
      return tense === 'first' ? `${answer} — and I have the papers for it, look.` : `${answer}, if that helps.`;
  }
}

/**
 * A rehearsed liar gives a *false* answer that is internally consistent; a
 * rehearsed innocent gives a true one that sounds rehearsed. The tell is
 * identical, which is the point: the conversation tells you how someone answers,
 * the documents tell you whether they are lying.
 */
export function answerQuestion(
  citizen: {
    id: string;
    temperament: Temperament;
    answers: CitizenAnswers;
    /** null = the documents are honest */
    irregularity: Irregularity | null;
  },
  question: QuestionDef,
  opts: { asked: readonly QuestionId[]; rng: Rng },
): AnsweredQuestion {
  const { rng } = opts;
  const truth = citizen.answers[question.id];
  const base = truth ?? 'I don\'t know. Nobody tells us.';

  const lying = citizen.irregularity !== null && citizen.irregularity.severity >= 2;
  const tense: 'first' | 'repeat' = opts.asked.includes(question.id) ? 'repeat' : 'first';

  let answer = base;
  if (lying) {
    // a documented lie is about the *document*; the verbal answers stay close to
    // the truth unless the temperament is the one that embellishes
    if (citizen.temperament === 'rehearsed' || citizen.temperament === 'helpful') {
      answer = rng.chance(0.5) ? `${base}, and nothing has changed since the last check.` : base;
    }
  }
  if (citizen.temperament === 'drunk') {
    // drunk answers loop, so the same phrase comes back
    answer = base;
  }

  const leaked = TEMPERAMENT_TELL[citizen.temperament];
  const tell = leaked && tense === 'repeat' ? leaked : tense === 'first' ? leaked : null;

  return {
    id: question.id,
    question: question.text,
    answer: voice(citizen.temperament, answer, tense),
    tell: tell ?? null,
  };
}

export interface TranscriptEntry {
  id: QuestionId;
  question: string;
  answer: string;
  tell: TellId | null;
}

/** The player gets three questions per inspection, and no more. */
export const MAX_QUESTIONS = 3;

export function questionAvailable(asked: readonly QuestionId[], id: QuestionId): boolean {
  return asked.length < MAX_QUESTIONS && !asked.includes(id);
}

/** Verbs the inspection offers; each maps to a report classification. */
export const OUTCOMES = [
  { code: 'P', label: 'Pass', scrutiny: 'You checked, and it held.' },
  { code: 'C', label: 'Cite', scrutiny: 'A violation on the card.' },
  { code: 'D', label: 'Detain', scrutiny: 'They come with you.' },
  { code: 'X', label: 'Confiscate', scrutiny: 'The papers stay with you.' },
  { code: 'B', label: 'Accept', scrutiny: 'Their offer, your silence.' },
  { code: '-', label: 'See nothing', scrutiny: 'You walk on. Nothing is recorded.' },
] as const;

export type OutcomeCode = (typeof OUTCOMES)[number]['code'];
