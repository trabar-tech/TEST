/**
 * The conversation (P1-T04, rebuilt after playtest 1).
 *
 * The tester said: *"good ai, greater interactions"*, and they were right — an inspection was
 * three fixed questions answered by a lookup table, which is a form, not an interview. What
 * this module adds is the smallest honest thing that makes it feel like one:
 *
 *  - **Pressure.** Sternness is a choice the Warden makes, and it is the interaction's only
 *    real lever. A stern Warden gets answers sooner and truthful ones less often. This is the
 *    trade the game is about, compressed into one control.
 *  - **Follow-ups.** Some questions only exist *because* of something already said. "You said
 *    the gate road — which gate?" is a question you can only ask if they told you the route.
 *    That single mechanism is the difference between an interview and a checklist: the
 *    transcript becomes the map of what you may ask next.
 *  - **Per-line tells.** The tell now belongs to the *answer*, not the temperament. A rehearsed
 *    person has one smooth sentence; the rest is ordinary. Then the player has something to
 *    notice rather than something to read.
 *
 * Everything here is pure and seed-driven. Two runs of the same seed with the same choices
 * produce the same conversation, because a player who is wrong has to be able to work out why.
 */

import type { Rng } from '@core/rng';
import type { Irregularity, Temperament, TellId } from './inspection';

/* ------------------------------------------------------------------ pressure */

export type Pressure = 'gentle' | 'neutral' | 'stern';

export interface PressureDef {
  id: Pressure;
  label: string;
  /** what it reads like on screen */
  gloss: string;
  /** openers of secondary questions when asking under pressure, chosen by rng */
  openers: readonly string[];
  /** how much the extra hardness raises the risk that command notices */
  scrutiny: number;
}

export const PRESSURES: readonly PressureDef[] = [
  {
    id: 'gentle',
    label: 'Walk them through it',
    gloss: 'Slower. They answer more, and they answer more honestly.',
    openers: ['Take your time.', 'No one is writing this down yet.'],
    scrutiny: 0,
  },
  {
    id: 'neutral',
    label: 'Ask it plainly',
    gloss: 'The form. Nothing added.',
    // identity: asking plainly is the baseline, and a baseline that costs something is not
    // a baseline. (AGENTS.md — every context modifier must define its no-context identity.)
    openers: ['', ''],
    scrutiny: 0,
  },
  {
    id: 'stern',
    label: 'Lean on them',
    gloss: 'Faster. And a frightened person says what you want to hear.',
    openers: ['I will ask once more.', 'Look at me.', 'You are wasting my night.'],
    scrutiny: 0.12,
  },
];

export function pressureDef(id: Pressure): PressureDef {
  return PRESSURES.find((p) => p.id === id) ?? PRESSURES[1]!;
}

/* ------------------------------------------------------------------- questions */

export type ConversationId =
  // primes: available from the start
  | 'shift_boss'
  | 'pass_line3'
  | 'hands'
  | 'rations'
  | 'neighbours'
  // follow-ups: only exist if something earlier opened them
  | 'which_gate'
  | 'who_told_you'
  | 'why_not_supervisor'
  | 'again_slower'
  | 'who_else_knows';

export interface ConversationDef {
  id: ConversationId;
  text: string;
  /** what a truthful answer sounds like, for the log */
  probes: string;
  /** false for follow-ups: they must be unlocked by something said */
  prime: boolean;
  /** a follow-up appears only when this holds for the transcript so far */
  opensWhen?: (said: readonly Line[]) => boolean;
  /** how much pressure this question applies, 0–1, used for the honesty roll */
  heat: number;
}

export interface Line {
  id: ConversationId | 'opener';
  question: string;
  answer: string;
  tell: TellId | null;
  /** the extra line a tell puts under the answer, when the player is told what it means */
  note?: string;
}

const said = (lines: readonly Line[], id: ConversationId): boolean => lines.some((l) => l.id === id);

export const CONVERSATION: readonly ConversationDef[] = [
  {
    id: 'shift_boss',
    text: 'Who is your shift boss?',
    probes: 'a name you can verify against the permit',
    prime: true,
    heat: 0.1,
  },
  {
    id: 'pass_line3',
    text: 'Read me the third line of your pass.',
    probes: 'the sector and block on the document',
    prime: true,
    heat: 0.2,
  },
  {
    id: 'hands',
    text: 'Show me your hands.',
    probes: 'a trade the permit claims',
    prime: true,
    heat: 0.15,
  },
  { id: 'rations', text: 'What did you draw this week?', probes: 'a class consistent with the card', prime: true, heat: 0.2 },
  {
    id: 'neighbours',
    text: 'Who lives in the flat above you?',
    probes: 'a name, not a story',
    prime: true,
    heat: 0.25,
  },
  {
    id: 'which_gate',
    // the follow-up the playtest asked for: it exists only because of what they said
    text: 'You said the gate road. Which gate?',
    probes: 'a gate that is actually on their route home',
    prime: false,
    heat: 0.35,
    opensWhen: (lines) => said(lines, 'pass_line3') || said(lines, 'neighbours') || said(lines, 'rations'),
  },
  {
    id: 'who_told_you',
    text: 'Who told you to say that?',
    probes: 'a name, or an admission that somebody did',
    prime: false,
    heat: 0.6,
    opensWhen: (lines) => lines.some((l) => l.tell === 'too_smooth' || l.tell === 'over_consistent'),
  },
  {
    id: 'why_not_supervisor',
    text: 'Why not take it to your supervisor?',
    probes: 'a reason that is not fear',
    prime: false,
    heat: 0.45,
    opensWhen: (lines) => said(lines, 'shift_boss'),
  },
  {
    id: 'again_slower',
    text: 'Say that again, slower.',
    probes: 'the same answer, rephrased the way honest people rephrase',
    prime: false,
    heat: 0.5,
    // the pressure move: asking somebody to repeat themselves is how you catch a rehearsal
    opensWhen: (lines) => lines.length > 0,
  },
  {
    id: 'who_else_knows',
    text: 'Who else knows you were out?',
    probes: 'somebody who would corroborate them',
    prime: false,
    heat: 0.55,
    opensWhen: (lines) => said(lines, 'neighbours') || said(lines, 'which_gate'),
  },
];

/** Questions the Warden may ask right now, in a stable order. */
export function availableQuestions(lines: readonly Line[], asked: readonly ConversationId[]): ConversationDef[] {
  return CONVERSATION.filter((q) => {
    if (asked.includes(q.id)) return false;
    if (q.prime) return true;
    return q.opensWhen ? q.opensWhen(lines) : false;
  });
}

/** The player gets three answers, and no more. Follow-ups are how you spend them well. */
export const MAX_ANSWERS = 3;

/* ------------------------------------------------------------------- answers */

export interface Person {
  id: string;
  temperament: Temperament;
  /** the truthful answer to each prime question */
  answers: Partial<Record<ConversationId, string>>;
  /** null = the documents are honest */
  irregularity: Irregularity | null;
}

/**
 * How likely this person is to shade the truth right now.
 *
 * Three inputs, all of them things the player can see or did: who they are (temperament),
 * whether their papers are wrong (a person with a bad document has a reason to lie), and what
 * the Warden is doing to them (pressure). Nothing here is re-rolled per question — the value
 * is computed once per answer from the same inputs, so a tester can reason about it.
 */
export function honesty(person: Person, pressure: Pressure, heat: number): number {
  const base: Record<Temperament, number> = {
    afraid: 0.55,
    indignant: 0.9,
    rehearsed: 0.35,
    drunk: 0.7,
    helpful: 0.85,
  };
  const pressured = pressure === 'stern' ? -0.18 : pressure === 'gentle' ? 0.12 : 0;
  const documented = person.irregularity ? -0.15 : 0;
  return clamp(base[person.temperament] + pressured + documented - heat * 0.25, 0.05, 0.98);
}

const TELL_OF: Record<Temperament, TellId> = {
  rehearsed: 'too_smooth',
  indignant: 'over_consistent',
  helpful: 'volunteers_documents',
  afraid: 'forgets_address',
  drunk: 'identical_repetition',
};

const MEANING: Record<TellId, string> = {
  too_smooth: 'The sentence came out whole, like something prepared.',
  over_consistent: 'They repeated it too exactly. That is not how memory works.',
  answers_unasked: 'They answered something you did not ask.',
  identical_repetition: 'Word for word, both times. Either true, or practised.',
  too_eager: 'They want you to like them more than they want to be believed.',
  forgets_address: 'They had to think about where they live.',
  volunteers_documents: 'They offered the papers before you asked. Most people hide them.',
};

const FALLBACK: Record<Temperament, string> = {
  afraid: "I don't know. Nobody tells us anything.",
  indignant: "I've told you everything I know.",
  rehearsed: 'That is what I said.',
  drunk: 'Ask me again tomorrow.',
  helpful: "Whatever you need, I'll say it.",
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * One answer.
 *
 * Deterministic given (person, question, lines so far, pressure, rng). The tell is attached
 * *per line* — one smooth sentence, not a whole smooth temperament — and only when the roll
 * says this is the line that leaks.
 */
export function answer(
  person: Person,
  q: ConversationDef,
  opts: { lines: readonly Line[]; pressure: Pressure; rng: Rng },
): Line {
  const { rng, pressure } = opts;
  const h = honesty(person, pressure, q.heat);
  const truthful = rng.next() < h;

  const known = person.answers[q.id];
  let text = known ?? FALLBACK[person.temperament];

  if (!truthful && known) {
    // a lie is a small, plausible displacement of the truth, not a different story: the
    // player should be able to *see* the shape of the true answer inside it
    text = displace(known, q.id, person.temperament, rng);
  }
  if (!known) {
    // follow-ups have no stored answer: they are derived from what was said, which is what
    // makes the transcript, not the table, the thing the player is reading
    text = derive(q.id, opts.lines, person, rng) ?? text;
  }

  const opener = pressureDef(pressure).openers[Math.floor(rng.next() * 2)] ?? '';
  const voiced = voice(text, person.temperament, opts.lines.length === 0);
  const tellRoll = rng.next();
  // the leak gets likelier the more the Warden leans, so pressure buys information and
  // costs truth — which is the whole trade
  const leakChance = (pressure === 'stern' ? 0.55 : pressure === 'gentle' ? 0.25 : 0.4) * (1 - h + 0.25);
  const tell = tellRoll < leakChance ? TELL_OF[person.temperament] : null;

  return {
    id: q.id,
    question: q.text,
    answer: opener ? `${opener} ${voiced}` : voiced,
    tell,
    note: tell ? MEANING[tell] : undefined,
  };
}

/** A lie keeps the true answer's shape. */
function displace(truth: string, qid: ConversationId, temperament: Temperament, rng: Rng): string {
  const hedges = ['I think', 'Near enough', 'About', 'Around'];
  if (qid === 'shift_boss') {
    // a rehearsed liar names somebody who cannot confirm it
    return temperament === 'rehearsed' ? 'B. Halvard, on the night line.' : truth.replace(/\w+/, 'Halvard');
  }
  if (qid === 'rations') return `${truth.replace(/\b[ABCD]\b/, 'C')}`;
  if (qid === 'which_gate') return 'The east one. The one with the lamp.';
  return `${hedges[Math.floor(rng.next() * hedges.length)]} ${truth}`;
}

/** Follow-ups are answered out of what has already been said. */
function derive(qid: ConversationId, lines: readonly Line[], person: Person, rng: Rng): string | null {
  const last = lines.at(-1)?.answer ?? '';
  switch (qid) {
    case 'which_gate':
      return last.match(/gate/i)
        ? 'The east gate. It is the only one that is open after dark.'
        : 'I come by the cut behind the laundry. There is no gate.';
    case 'why_not_supervisor':
      return person.temperament === 'afraid'
        ? 'Because he would write me up for wasting his time.'
        : 'He would want to know why I was talking to you at all.';
    case 'who_told_you':
      return person.temperament === 'rehearsed'
        ? 'Nobody. I just know how this goes.'
        : 'My cousin said what to say. He has been stopped before.';
    case 'again_slower':
      // deliberately a *different sentence with the same content*: honest people rephrase
      return last ? rephrase(last) : 'Where do you want me to start?';
    case 'who_else_knows': {
      const n = person.answers.neighbours ?? 'the woman upstairs';
      return `${n} saw me. Ask her.`;
    }
    default:
      return rng.chance(0.5) ? null : null;
  }
}

/** Same content, different words — the shape of an honest repetition. */
function rephrase(s: string): string {
  return s
    .replace(/^I think\s+/i, '')
    .replace(/\bdidn't\b/gi, 'did not')
    .replace(/\bcan't\b/gi, 'cannot')
    .replace(/\.$/, s.length > 40 ? '. That is it.' : '.');
}

function voice(text: string, temperament: Temperament, first: boolean): string {
  switch (temperament) {
    case 'afraid':
      return first ? `${text}. Please.` : `${text}. I told you.`;
    case 'indignant':
      return first ? `${text}, and you can check it, everyone checks it.` : `${text}. Exactly that.`;
    case 'rehearsed':
      return `${text}.`;
    case 'drunk':
      return first ? `${text}, I said, ${text}.` : `${text}. Same as I said.`;
    case 'helpful':
      return first ? `${text} — and I have the papers for it, look.` : `${text}, if that helps.`;
  }
}

/**
 * What the Warden can honestly write afterwards.
 *
 * The point of a conversation system is that it changes what you *can* put on the form. A
 * corroborated answer and an uncorroborated one are different lines, and the desk should be
 * able to say so.
 */
export function conversationSummary(lines: readonly Line[]): {
  corroborated: boolean;
  tells: number;
  strongest: string | null;
} {
  const tells = lines.filter((l) => l.tell).length;
  const corroborated = lines.some((l) => l.id === 'who_else_knows' && !l.tell);
  return { corroborated, tells, strongest: lines.find((l) => l.note)?.note ?? null };
}
