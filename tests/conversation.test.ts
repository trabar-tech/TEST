/**
 * P1-T04 — the conversation, rebuilt.
 *
 * The playtest asked for "greater interactions" and was right: three fixed questions answered
 * by a table is a form. These tests cover the three things that make it an interview instead —
 * pressure, follow-ups, and tells that belong to a line rather than a person — and they are
 * deliberately about *properties*, not wording, so content can be rewritten freely.
 */

import { describe, expect, it } from 'vitest';
import { streamFor } from '@core/rng';
import { computeExposure } from '@core/record';
import {
  CONVERSATION,
  MAX_ANSWERS,
  PRESSURES,
  answer,
  availableQuestions,
  conversationSummary,
  honesty,
  pressureDef,
  type ConversationDef,
  type ConversationId,
  type Line,
  type Person,
} from '@systems/conversation';

const rng = (seed = 1) => streamFor(seed, 1, 'conversation-test');
const q = (id: ConversationId) => CONVERSATION.find((c) => c.id === id)!;

const person = (over: Partial<Person> = {}): Person => ({
  id: 'c-0001',
  temperament: 'afraid',
  answers: {
    shift_boss: 'R. Feld, on the day line',
    pass_line3: 'Sector four, block nine',
    hands: 'I sort laundry',
    rations: 'C class, same as the card',
    neighbours: 'A woman called Sena',
  },
  irregularity: null,
  ...over,
});

describe('pressure is the interaction’s only lever, and it cuts both ways', () => {
  it('leaning on somebody makes them more likely to shade the truth', () => {
    const p = person();
    const gentle = honesty(p, 'gentle', 0.3);
    const neutral = honesty(p, 'neutral', 0.3);
    const stern = honesty(p, 'stern', 0.3);
    expect(gentle).toBeGreaterThan(neutral);
    expect(stern).toBeLessThan(neutral);
  });

  it('a bad document makes somebody less honest, whoever they are', () => {
    const clean = person();
    const dirty = person({ irregularity: { field: 'chip_serial', kind: 'wrong_class_digit', severity: 2 } });
    expect(honesty(dirty, 'neutral', 0.3)).toBeLessThan(honesty(clean, 'neutral', 0.3));
  });

  it('a hot question is riskier than a mild one', () => {
    const p = person();
    expect(honesty(p, 'neutral', 0.6)).toBeLessThan(honesty(p, 'neutral', 0.1));
  });

  it('each manner reads differently on screen, so the choice is legible', () => {
    for (const p of PRESSURES) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.gloss.length).toBeGreaterThan(0);
    }
    expect(pressureDef('stern').scrutiny).toBeGreaterThan(pressureDef('gentle').scrutiny);
  });
});

describe('a follow-up exists because of what they said', () => {
  it('the primes are open from the start, in a stable order', () => {
    const open = availableQuestions([], []);
    expect(open.every((o) => o.prime)).toBe(true);
    expect(open.map((o) => o.id)).toEqual(['shift_boss', 'pass_line3', 'hands', 'rations', 'neighbours']);
  });

  it('a question about which gate needs something about a route first', () => {
    expect(availableQuestions([], []).map((o) => o.id)).not.toContain('which_gate');
    const said: Line[] = [{ id: 'rans','question': 'q', 'answer': 'I walk the gate road home', tell: null } as unknown as Line];
    const after: Line[] = [{ id: 'rations', question: 'q', answer: 'I come by the gate road', tell: null }];
    void said;
    expect(availableQuestions(after, ['rations']).map((o) => o.id)).toContain('which_gate');
  });

  it('"who told you to say that" only opens once something sounded rehearsed', () => {
    const plain: Line[] = [{ id: 'hands', question: 'q', answer: 'I sort laundry', tell: null }];
    expect(availableQuestions(plain, ['hands']).map((o) => o.id)).not.toContain('who_told_you');
    const smooth: Line[] = [{ id: 'hands', question: 'q', answer: 'I sort laundry', tell: 'too_smooth' }];
    expect(availableQuestions(smooth, ['hands']).map((o) => o.id)).toContain('who_told_you');
  });

  it('overheard questions are never in the list twice', () => {
    const lines: Line[] = [{ id: 'neighbours', question: 'q', answer: 'a woman called Sena', tell: null }];
    const open = availableQuestions(lines, ['neighbours', 'which_gate']);
    expect(open.filter((o) => o.id === 'which_gate')).toHaveLength(0);
  });

  it('three answers, not three questions — the budget is what makes ordering a decision', () => {
    expect(MAX_ANSWERS).toBe(3);
  });
});

describe('follow-ups are answered out of the transcript, not a table', () => {
  const ctx = (lines: Line[], pressure: 'neutral' = 'neutral') => ({ lines, pressure, rng: rng(3) });

  it('a question with no stored answer still gets one', () => {
    const lines: Line[] = [{ id: 'rations', question: 'q', answer: 'I come by the gate road', tell: null }];
    const line = answer(person(), q('which_gate'), ctx(lines));
    expect(line.answer.length).toBeGreaterThan(0);
    expect(line.answer).toMatch(/gate/i);
  });

  it('"say that again" rephrases instead of repeating, which is how honesty sounds', () => {
    const lines: Line[] = [{ id: 'hands', question: 'q', answer: "I can't show you, I didn't wash", tell: null }];
    const line = answer(person(), q('again_slower'), ctx(lines));
    expect(line.answer).not.toContain("can't");
    expect(line.answer).toContain('cannot');
  });
});

describe('answers are deterministic, so a wrong player can work out why', () => {
  it('same seed, same person, same answer', () => {
    const p = person({ temperament: 'rehearsed' });
    const a = answer(p, q('shift_boss'), { lines: [], pressure: 'stern', rng: rng(9) });
    const b = answer(p, q('shift_boss'), { lines: [], pressure: 'stern', rng: rng(9) });
    expect(a).toEqual(b);
  });

  it('different pressure can produce a different answer, which is the point of the lever', () => {
    const p = person({ temperament: 'afraid' });
    const seen = new Set<string>();
    for (const pressure of ['gentle', 'neutral', 'stern'] as const) {
      seen.add(answer(p, q('rations'), { lines: [], pressure, rng: rng(4) }).answer);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('a loud manner prepends something the quiet one does not', () => {
    const stern = answer(person(), q('hands'), { lines: [], pressure: 'stern', rng: rng(2) });
    expect(stern.answer).toMatch(/^I will ask once more|^Look at me|^You are wasting my night/);
  });
});

describe('a tell belongs to a line, and says what it means', () => {
  it('over many answers some lines leak and some do not', () => {
    let leaks = 0;
    let quiet = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const line = answer(person({ temperament: 'rehearsed' }), q('shift_boss'), {
        lines: [],
        pressure: 'neutral',
        rng: rng(seed),
      });
      line.tell ? leaks++ : quiet++;
    }
    expect(leaks).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(0);
  });

  it('a flagged line carries its meaning, so the player is told what to think of it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const line = answer(person({ temperament: 'rehearsed' }), q('hands'), {
        lines: [],
        pressure: 'neutral',
        rng: rng(seed),
      });
      if (line.tell) {
        expect(line.note).toBeTruthy();
        return;
      }
    }
    throw new Error('no seed produced a tell; the leak chance is broken');
  });
});

describe('what the conversation lets you write down', () => {
  it('a corroborated answer is recognisable afterwards', () => {
    const lines: Line[] = [
      { id: 'neighbours', question: 'q', answer: 'a woman called Sena', tell: null },
      { id: 'who_else_knows', question: 'q', answer: 'Sena saw me', tell: null },
    ];
    const s = conversationSummary(lines);
    expect(s.corroborated).toBe(true);
    expect(s.tells).toBe(0);
  });

  it('a flag on the corroborating answer means it is not corroboration', () => {
    const lines: Line[] = [{ id: 'who_else_knows', question: 'q', answer: 'Sena saw me', tell: 'too_smooth' }];
    expect(conversationSummary(lines).corroborated).toBe(false);
  });

  it('an empty conversation claims nothing', () => {
    expect(conversationSummary([])).toEqual({ corroborated: false, tells: 0, strongest: null });
  });
});

describe('the vocabulary stays honest', () => {
  it('every follow-up declares how it opens, and every prime does not', () => {
    for (const def of CONVERSATION as readonly ConversationDef[]) {
      if (def.prime) expect(def.opensWhen).toBeUndefined();
      else expect(typeof def.opensWhen).toBe('function');
    }
  });

  it('no question text is empty, and no two are the same', () => {
    const texts = CONVERSATION.map((c) => c.text);
    expect(texts.every((t) => t.length > 3)).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('the manner reaches the desk, or it is decoration', () => {
  it('a stern interview on an honest line still reads as something the street saw', () => {
    const truth = {
      classification: 'P',
      force_rung: 2,
      detainees: 0,
      casualties: 0,
      damage: 0,
      third_party_present: false,
      illegal_search: false,
      bribe_taken: false,
    } as const;
    const claim = truth as never;
    const calm = computeExposure({ candidate: claim, truth: truth as never, cameras: [], witnesses: [], contradictions: [] });
    const loud = computeExposure({ candidate: claim, truth: truth as never, cameras: [], witnesses: [], contradictions: [], manner: 0.12 });
    expect(calm.risk_score).toBe(0); // an honest line, quietly asked, is invisible
    expect(loud.risk_score).toBeGreaterThan(0); // the same line, leaned on, is not
    expect(loud.risk_score).toBeLessThanOrEqual(0.3); // and never as bad as a lie
  });

  it('the neutral manner is the identity: it costs nothing', () => {
    const truth = {
      classification: 'P',
      force_rung: 2,
      detainees: 0,
      casualties: 0,
      damage: 0,
      third_party_present: false,
      illegal_search: false,
      bribe_taken: false,
    } as const;
    const base = computeExposure({ candidate: truth as never, truth: truth as never, cameras: [], witnesses: [], contradictions: [] });
    const neutral = computeExposure({ candidate: truth as never, truth: truth as never, cameras: [], witnesses: [], contradictions: [], manner: 0 });
    expect(neutral.risk_score).toBe(base.risk_score);
  });
});
