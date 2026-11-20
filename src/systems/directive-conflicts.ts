/**
 * Standing orders that contradict each other (P3-T11).
 *
 * The phase doc requires that "a daily directive can contradict a standing one and
 * both are enforceable" — and `findDirectiveCycles` already *detects* the graph and
 * warns the author. Detection is not enforcement: a Warden who obeys both halves of
 * a contradiction currently gets away with it, which makes the graph a comment.
 *
 * The mechanism has to be narrow, because this could easily become a second audit
 * nobody asked for:
 *
 *  - A directive carries `tags`: the *acts* it requires.
 *  - Two live directives conflict when they share a tag and name each other
 *    (`contradicts`), or share a tag and both set a quota for the same act.
 *  - A filed line `satisfies` a directive when it carries one of the directive's
 *    tags.
 *
 * Then: you cannot satisfy both halves of a contradiction in the same shift. Whichever
 * act you perform breaks the other order, and the sheet says so **in the Directorate's
 * voice**, because the fairness rule is that a consequence names its cause.
 *
 * The trap is deliberately escapable: obeying neither half is a chosen failure you
 * can see coming, and the sheet names that too.
 */

import type { Directive } from '@core/content';
import type { ReportLine } from '@core/record';
import type { Finding } from './audit';

/**
 * The wiring `DirectiveSchema` does not carry yet: which acts a directive demands.
 *
 * Kept as a lookup rather than added to the schema because directive text is
 * authored prose and its tags are editorial judgement; when the directive authoring
 * pass happens (P3-T11's remaining volume), this table becomes a field.
 */
export const DIRECTIVE_TAGS: Record<string, string[]> = {
  'dir-0180': ['pass_check'],
  'dir-0197': ['inspection'],
  'dir-0201': ['patrol'],
  'dir-0202': ['inspection', 'household_check'],
  'dir-0203': ['report_shortfall'],
  'dir-0204': ['resolve_shortfall'],
  'dir-0205': ['pass_check'],
  'dir-0206': ['authorisation'],
  'dir-0207': ['review_detention'],
  'dir-0208': ['informant'],
  'dir-0209': ['requisition'],
  'dir-0210': ['inspection'],
  'dir-0211': ['clear'],
  'dir-0212': ['arrest'],
  'dir-0213': ['classify'],
  'dir-0214': ['patrol'],
  'dir-0215': ['camera'],
  'dir-0216': ['incident_report'],
  'dir-0217': ['charge_household'],
  'dir-0218': ['report'],
  'dir-0219': ['door_check'],
  'dir-0220': ['detain'],
};

/**
 * Filing tags → the acts a standing order can demand.
 *
 * The desk tags a line with what it *noticed* (`insufficient_papers`), not with the
 * act the Directorate wrote an order about (`inspection`). Comparing the two strings
 * directly is why the contradiction warning never fired in the first place — the
 * vocabulary gap is the bug, so it gets a table rather than a heuristic.
 */
export const TAG_TO_ACTS: Record<string, string[]> = {
  insufficient_papers: ['inspection', 'pass_check', 'household_check'],
  curfew_violation: ['pass_check', 'patrol'],
  resisting: ['arrest', 'detain'],
  assault_on_officer: ['arrest', 'detain'],
  property_damage: ['clear', 'requisition'],
  unlawful_assembly: ['arrest', 'clear'],
  contraband: ['inspection', 'clear', 'requisition'],
  forced_entry: ['clear', 'requisition'],
  noise_complaint: ['patrol', 'household_check'],
  witness_removed: ['detain', 'arrest'],
  scene_cleared: ['clear'],
  no_line_filed: ['report'],
};

/** Expand filing tags into the directive acts they count as, keeping the originals. */
export function expandActs(tags: Iterable<string>): Set<string> {
  const acts = new Set<string>();
  for (const tag of tags) {
    acts.add(tag);
    for (const act of TAG_TO_ACTS[tag] ?? []) acts.add(act);
  }
  return acts;
}

/** The acts a filed line performed, derived from its claim and tags. */
export function actsOf(line: Pick<ReportLine, 'claim' | 'tags'>): Set<string> {
  const acts = expandActs(line.tags);
  // the classification is itself an act: filing C is a "clear"
  if (line.claim.classification === 'C') acts.add('clear');
  if (line.claim.classification === 'P' || line.claim.classification === 'D') acts.add('arrest');
  return acts;
}

/**
 * Tags come from the directive itself when the author supplied them, and from the
 * table otherwise. The table exists so that the orders already written can be
 * scored without an authoring pass; it is not a second source of truth.
 */
export function tagsFor(directive: Directive): string[] {
  const own = (directive as { tags?: string[] }).tags ?? [];
  if (own.length > 0) return [...own];
  return DIRECTIVE_TAGS[directive.id] ?? [];
}

export interface DirectiveState {
  /** directives in force this shift */
  live: readonly Directive[];
  /** ids of directives already obeyed this shift */
  satisfied: readonly string[];
}

export interface ConflictOptions {
  lines: readonly ReportLine[];
  state: DirectiveState;
}

/**
 * One pair of standing orders that cannot both be obeyed, with the evidence.
 * Exposed so the desk can *warn before signing* — a contradiction the player only
 * meets on the audit sheet is a trap, and traps are what this design forbids.
 */
export interface DirectiveConflict {
  a: string;
  b: string;
  /** the act quoted in the sentence */
  act: string;
  /** every act that puts the two orders in each other's way */
  contested: string[];
  /** one sentence, in the Directorate's voice */
  sentence: string;
}

/**
 * Every conflicting pair among the live directives. Order-stable: the pair is
 * normalised by id, so the same two orders always report the same way round.
 *
 * Two ways to conflict:
 *  - **declared**: the author says so in `contradicts`, and the acts may be
 *    different on purpose (report the shortfall *or* resolve it — the pair in the
 *    shipped content is exactly this, and it is the interesting case, because both
 *    halves are individually correct).
 *  - **structural**: two orders demand the same act, so performing it cannot
 *    satisfy both.
 */
export function findConflicts(live: readonly Directive[]): DirectiveConflict[] {
  const out: DirectiveConflict[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const pair = [live[i]!, live[j]!].sort((x, y) => (x.id < y.id ? -1 : 1));
      const first = pair[0]!;
      const second = pair[1]!;
      const declared: string[] = (first as { contradicts?: string[] }).contradicts ?? [];
      const declaredOther: string[] = (second as { contradicts?: string[] }).contradicts ?? [];
      const named = declared.includes(second.id) || declaredOther.includes(first.id);
      const shared = tagsFor(first).filter((t) => tagsFor(second).includes(t));
      if (!named && shared.length === 0) continue;

      const acts = [...tagsFor(first), ...tagsFor(second)];
      out.push({
        a: first.id,
        b: second.id,
        act: shared[0] ?? acts[0] ?? 'clear',
        /** every act that puts the two orders in each other's way */
        contested: [...new Set(shared.length > 0 ? shared : acts)],
        sentence: named
          ? `${first.id} and ${second.id} cannot both be obeyed: each requires an act the other treats as the failure it is policing.`
          : `${first.id} and ${second.id} cannot both be obeyed: both require ${shared[0]}.`,
      });
    }
  }
  return out;
}

function hasAct(d: Directive, act: string): boolean {
  return tagsFor(d).includes(act);
}

/**
 * Run the contradiction test over a shift's filings.
 *
 * Returns findings in the audit's own shape so the sheet reads as one document
 * rather than two systems arguing on the same page.
 */
export function directiveFindings(opts: ConflictOptions): Finding[] {
  const conflicts = findConflicts(opts.state.live);
  if (conflicts.length === 0) return [];

  const findings: Finding[] = [];
  for (const conflict of conflicts) {
    const obeyedA = opts.state.satisfied.includes(conflict.a);
    const obeyedB = opts.state.satisfied.includes(conflict.b);
    const performed = new Set<string>();
    for (const line of opts.lines) for (const act of actsOf(line)) performed.add(act);
    const lineFor = opts.lines.find((l) => actsOf(l).has(conflict.act));

    if (obeyedA && obeyedB && lineFor) {
      findings.push({
        kind: 'directive',
        line_id: lineFor.id,
        evidence:
          `you obeyed ${conflict.a} and ${conflict.b} on the same sheet. ` +
          `${conflict.a} required ${conflict.act}; ${conflict.b} counts that act against you`,
        confidence: 1,
        weight: 0.35,
      });
      continue;
    }

    // Obeyed one half only: that is the trap closing, and it still needs a name on
    // the sheet — the player should be able to see which order they broke.
    if (obeyedA !== obeyedB) {
      const broken = obeyedA ? conflict.b : conflict.a;
      const kept = obeyedA ? conflict.a : conflict.b;
      if (!lineFor) continue;
      findings.push({
        kind: 'directive',
        line_id: lineFor.id,
        evidence: `obeying ${kept} broke ${broken}: the two cannot both be satisfied this shift`,
        confidence: 1,
        weight: 0.2,
      });
    }
  }
  return findings;
}

/**
 * Which of tonight's orders were obeyed, from the filed lines alone. A directive is
 * satisfied when any line performed one of its acts; quotas are not measured here
 * (the shift keeps its own tally), only the *act*.
 */
export function satisfiedDirectives(live: readonly Directive[], lines: readonly ReportLine[]): string[] {
  const performed = new Set<string>();
  for (const line of lines) for (const act of actsOf(line)) performed.add(act);
  return live.filter((d) => tagsFor(d).some((t) => performed.has(t))).map((d) => d.id);
}

/**
 * What the desk says *before* the player signs, so the contradiction is a decision
 * rather than an ambush. Empty when nothing live conflicts.
 */
export function conflictWarnings(live: readonly Directive[], performed: Iterable<string>): string[] {
  const conflicts = findConflicts(live);
  if (conflicts.length === 0) return [];
  const acts = expandActs(performed);
  const warnings: string[] = [];
  for (const c of conflicts) {
    const touched = c.contested.find((act) => acts.has(act));
    if (!touched) continue;
    warnings.push(
      `${c.a} and ${c.b} are both in force tonight. Filing ${touched} satisfies one and breaks the other.`,
    );
  }
  return [...new Set(warnings)];
}
