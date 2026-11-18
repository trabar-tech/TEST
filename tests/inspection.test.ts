/**
 * P1-T03 / P1-T04 acceptance:
 *  - a bad chip serial is caught in one check by someone who read the rule once
 *  - a citizen with no irregularity cannot be falsely caught by the checks
 *  - the same citizen answers the same question identically, forever
 *  - a rehearsed liar is identifiable from over-consistency, not from a pixel
 */

import { describe, expect, it } from 'vitest';
import { makeRng, type Rng } from '@core/rng';
import {
  MAX_QUESTIONS,
  QUESTIONS,
  TELLS,
  answerQuestion,
  chipChecksumValid,
  districtValid,
  failingFields,
  paperDefectFound,
  questionAvailable,
  runChecks,
  type CitizenAnswers,
  type Irregularity,
  type Papers,
  type Temperament,
} from '@systems/inspection';

const papers = (over: Partial<Papers> = {}): Papers => ({
  name: 'M. Ostrow',
  district_stamp: 'S4',
  ration_class: 'C',
  work_permit: 'laundry-2',
  // C + 4+4+7+1 = 16 → 6 % 10 = 6 ... the sample uses 8, so this document is bad
  chip_serial: 'C-4471-8',
  curfew_pass: true,
  ...over,
});

describe('chip checksum', () => {
  it('accepts a serial whose check digit matches', () => {
    // C, 4+4+7+1 = 16; (3 + 16) % 10 = 9
    expect(chipChecksumValid('C-4471-9', 'C')).toBe(true);
    // A, 9+0+3+2 = 14; (1 + 14) % 10 = 5
    expect(chipChecksumValid('A-9032-5', 'A')).toBe(true);
  });

  it('rejects a wrong check digit — the sample citizen', () => {
    expect(chipChecksumValid('C-4471-8', 'C')).toBe(false);
  });

  it('rejects a serial whose class letter disagrees with the card', () => {
    expect(chipChecksumValid('B-4471-9', 'C')).toBe(false);
  });

  it('rejects malformed serials instead of throwing', () => {
    for (const bad of ['', 'C4471', 'X-4471-9', 'C-4-9', 'nope']) {
      expect(chipChecksumValid(bad, 'C')).toBe(false);
    }
  });
});

describe('district stamp', () => {
  it('accepts S4 and its case/whitespace variants', () => {
    expect(districtValid('S4')).toBe(true);
    expect(districtValid(' s4 ')).toBe(true);
  });
  it('rejects another sector without a transfer slip', () => {
    expect(districtValid('S3')).toBe(false);
  });
});

describe('the three checks', () => {
  it('a clean citizen fails nothing, at every shift', () => {
    const clean = papers({ chip_serial: 'C-4471-9', curfew_pass: true });
    for (const shift of [1, 5, 12, 20]) {
      const results = runChecks(clean, { shift });
      expect(failingFields(results), `shift ${shift}`).toEqual([]);
    }
  });

  it('a bad serial is caught by one check, and only that one', () => {
    const results = runChecks(papers(), { shift: 1 });
    expect(failingFields(results)).toEqual(['chip_serial']);
  });

  it('a wrong district is caught by the district check', () => {
    // D, 7+7+0+2 = 16; (4 + 16) % 10 = 0. Class letter must follow the card too.
    const results = runChecks(
      papers({ ration_class: 'D', chip_serial: 'D-7702-0', district_stamp: 'S3' }),
      { shift: 1 },
    );
    expect(failingFields(results)).toEqual(['district_stamp']);
  });

  it('does not flag an absent curfew pass as a defect once it has lapsed anyway', () => {
    const results = runChecks(papers({ chip_serial: 'C-4471-9', curfew_pass: false }), { shift: 13 });
    expect(failingFields(results)).toEqual([]);
  });

  it('the seal is only readable under a full check, and ±15° is the line', () => {
    const noFull = runChecks(papers({ chip_serial: 'C-4471-9' }), { shift: 1, sealDegrees: 40 });
    expect(noFull.some((r) => r.id === 'seal_warp')).toBe(false);

    const square = runChecks(papers({ chip_serial: 'C-4471-9' }), { shift: 1, fullCheck: true, sealDegrees: 15 });
    expect(square.find((r) => r.id === 'seal_warp')!.pass).toBe(true);

    const warped = runChecks(papers({ chip_serial: 'C-4471-9' }), { shift: 1, fullCheck: true, sealDegrees: 16 });
    expect(warped.find((r) => r.id === 'seal_warp')!.pass).toBe(false);
  });

  it('no clean citizen can be falsely caught, over 200 random clean cards', () => {
    const rng = makeRng(1234);
    const classes = ['A', 'B', 'C', 'D'] as const;
    const digit: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };
    for (let i = 0; i < 200; i++) {
      const cls = classes[rng.int(0, 3)]!;
      const d = [rng.int(0, 9), rng.int(0, 9), rng.int(0, 9), rng.int(0, 9)];
      const check = (digit[cls]! + d.reduce((a, b) => a + b, 0)) % 10;
      const serial = `${cls}-${d.join('')}-${check}`;
      const results = runChecks(papers({ ration_class: cls, chip_serial: serial }), { shift: 1 });
      expect(failingFields(results), serial).toEqual([]);
    }
  });
});

describe('paper defects', () => {
  it('maps a defect to whether any check caught it', () => {
    const results = runChecks(papers(), { shift: 1 });
    expect(paperDefectFound({ field: 'chip_serial', kind: 'wrong_class_digit', severity: 1 }, results)).toBe(true);
    expect(paperDefectFound(null, results)).toBe(false);
  });
});

describe('the conversation', () => {
  const answers: CitizenAnswers = {
    shift_boss: 'D. Vask',
    pass_line3: 'sector 4, block c',
    hands: 'dye stains',
  };

  const citizen = (temperament: Temperament, irregularity: Irregularity | null = null) =>
    ({ id: 'c-0221', temperament, answers, irregularity }) as Parameters<typeof answerQuestion>[0];

  const ask = (c: ReturnType<typeof citizen>, q = QUESTIONS[0]!, asked: QuestionId[] = [], seed = 7) =>
    answerQuestion(c, q, { asked, rng: makeRng(seed) });

  it('gives the same answer to the same question, forever', () => {
    const c = citizen('rehearsed');
    const first = ask(c, QUESTIONS[0]!, [], 99);
    const again = ask(c, QUESTIONS[0]!, [], 99);
    expect(again).toEqual(first);
  });

  it('voices each temperament distinctly', () => {
    const voices = (['afraid', 'indignant', 'rehearsed', 'drunk', 'helpful'] as Temperament[]).map(
      (t) => ask(citizen(t)).answer,
    );
    expect(new Set(voices).size).toBe(5);
    expect(voices[2]).toBe('D. Vask.'); // rehearsed: no ornament at all
  });

  it('leaks a tell that matches the temperament', () => {
    for (const t of ['afraid', 'indignant', 'rehearsed', 'drunk', 'helpful'] as Temperament[]) {
      const a = ask(citizen(t));
      expect(a.tell).not.toBeNull();
      expect(TELLS[a.tell!].temperament).toBe(t);
    }
  });

  it('a repeated question yields the same fact with a repeat-voice', () => {
    const c = citizen('indignant');
    const first = ask(c, QUESTIONS[0]!, []);
    const repeated = ask(c, QUESTIONS[0]!, ['shift_boss']);
    expect(first.answer).not.toBe(repeated.answer);
    expect(repeated.answer).toContain('D. Vask');
  });

  it('never runs past three questions', () => {
    const asked = [QUESTIONS[0]!.id, QUESTIONS[1]!.id, QUESTIONS[2]!.id];
    expect(questionAvailable(asked, QUESTIONS[3]!.id)).toBe(false);
    expect(questionAvailable(asked.slice(0, 2), QUESTIONS[3]!.id)).toBe(true);
    expect(asked.length).toBe(MAX_QUESTIONS);
  });

  it('the question pool is big enough to make choices real', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(6);
    expect(QUESTIONS.length).toBeGreaterThan(MAX_QUESTIONS);
  });

  it('an honest rehearsed citizen sounds exactly like a rehearsed liar', () => {
    // the whole point of temperament-as-tell: the voice cannot convict anyone
    const honest = ask(citizen('rehearsed', null), QUESTIONS[0]!, [], 3);
    const liar = ask(citizen('rehearsed', { field: 'name', kind: 'seal_warp', severity: 3 }), QUESTIONS[0]!, [], 3);
    expect(liar.tell).toBe(honest.tell);
  });
});

type QuestionId = (typeof QUESTIONS)[number]['id'];
