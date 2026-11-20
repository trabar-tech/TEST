/**
 * Content loading and validation.
 *
 * All game content is JSON (ADR-0001, ADR-0004). It is validated at boot and
 * frozen, so a typo fails with `file: path — message` instead of producing an
 * `undefined` three shifts into a playtest.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ schema */

export const ContentVersion = '0.1.0';

const RationClass = z.enum(['A', 'B', 'C', 'D']);

export const PapersSchema = z.object({
  name: z.string().min(1),
  district_stamp: z.string().min(1),
  ration_class: RationClass,
  work_permit: z.string().min(1),
  curfew_pass: z.boolean(),
  chip_serial: z.string().regex(/^[A-D]-\d{4}-\d$/, 'chip_serial must look like C-4471-8'),
});

export const IrregularitySchema = z.object({
  field: z.enum([
    'name',
    'district_stamp',
    'ration_class',
    'work_permit',
    'curfew_pass',
    'chip_serial',
  ]),
  kind: z.string().min(1),
  /** 1 = visible on inspection, 3 = only caught with a full check */
  severity: z.number().int().min(1).max(3),
});

export const CitizenSchema = z.object({
  id: z.string().min(1),
  archetype: z.string().min(1),
  name_seed: z.number().int().nonnegative(),
  temperament: z.enum(['afraid', 'indignant', 'rehearsed', 'drunk', 'helpful']),
  papers: PapersSchema,
  irregularity: IrregularitySchema.nullable().default(null),
  knowledge: z.array(z.string()).default([]),
  routine: z.array(z.string()).min(1),
});

/** Storylet prerequisite language (SYS-STORY-01). Every field is optional and
 *  all present fields must hold. */
export const RequiresSchema = z
  .object({
    temperature: z.tuple([z.number(), z.number()]).optional(),
    time_of_day: z.array(z.enum(['morning', 'midday', 'evening', 'night'])).optional(),
    shift_min: z.number().int().optional(),
    shift_max: z.number().int().optional(),
    shift_since_cause: z.tuple([z.number().int(), z.number().int()]).optional(),
    flags_any: z.array(z.string()).optional(),
    flags_none: z.array(z.string()).optional(),
    /**
     * Gate on the Known set (max 12 people the Warden can recall by name).
     * A storylet that wants to introduce a new Known must either have room or
     * be able to evict — that decision is the SYS-DIR-01 Q4 question, so the
     * content is allowed to state which side of it it needs.
     */
    known_set_has_room: z.boolean().optional(),
  })
  .strict();

export const ResolutionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** report classification this outcome would file */
  claim: z.enum(['P', 'C', 'D', 'X', 'B', '-', 'R', 'NR']),
  legitimacy: z.number().default(0),
  standing: z.number().default(0),
  integrity: z.number().default(0),
  /** sim seconds */
  time: z.number().nonnegative().default(0),
  note: z.string().optional(),
  witness_gate: z.boolean().optional(),
  /** resolution reveals an integrity-only fact; used by the debug overlay */
  integrity_hint: z.boolean().optional(),
  effects: z
    .object({
      set_flag: z.string().optional(),
      schedule_epilogue: z.string().optional(),
    })
    .partial()
    .optional(),
})
  .strict();

export const StoryletSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  _type: z.enum(['micro_event', 'epilogue_storylet']).optional(),
  requires: RequiresSchema.default({}),
  /** prior-state dependencies — the connective-tissue budget is measured from this */
  references: z.array(z.string()).default([]),
  deck: z.string().min(1).default('beat_morning'),
  /**
   * The directors' vocabulary (SYS-DIR-01 §6). These live on the storylet rather
   * than beside it because the scorer multiplies all four factors for every card,
   * and a field the schema strips is a field the director silently ignores.
   */
  /** how sharp this card is; the Arbiter's RELEASE state refuses anything >= 0.5 */
  pressure: z.number().min(0).max(1).default(0.5),
  /** which Warden habits the Desk should lean on when offering this */
  fault_lines: z.array(z.string()).default([]),
  /** the temperature band it was written for; outside it the card fades, not vanishes */
  temperature_band: z.tuple([z.number(), z.number()]).optional(),
  /** novelty grouping; defaults to the deck name */
  archetype: z.string().min(1).optional(),
  weight: z
    .object({
      base: z.number().positive().default(1),
      connective_bonus: z.number().nonnegative().default(0),
    })
    .default({ base: 1, connective_bonus: 0 }),
  beats: z.array(z.object({ text: z.string().min(1) })).min(1),
  resolutions: z.array(ResolutionSchema).min(2),
});

export const IncidentSchema = z.object({
  id: z.string().min(1),
  archetype: z.string().min(1),
  title: z.string().min(1),
  difficulty_band: z.tuple([z.number(), z.number()]),
  fault_lines: z.array(z.string()).default([]),
  map_id: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  dispatch_text: z.string().min(1),
  expected_report: z
    .object({
      category: z.string(),
      classification_choices: z.array(z.string()),
      likely_force_floor: z.number(),
    })
    .optional(),
});

export const DirectiveSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['daily', 'standing']),
  text: z.string().min(1),
  quota: z
    .object({
      inspections: z.number().int(),
      detentions: z.number().int(),
      visible_patrol_minutes: z.number().int(),
    })
    .nullable()
    .default(null),
  contradicts: z.array(z.string()).default([]),
  audit_weight: z.number().default(1),
  reward: z.record(z.number()).optional(),
  penalty: z.record(z.number()).optional(),
});

/* -------------------------------------------------- authored cast (Phase 1) */

/**
 * The slice cast is *authored*, not procedurally named, so it does not use
 * `CitizenSchema` (which carries `name_seed` for Phase 3's generator). Splitting
 * the two schemas keeps the generator's contract strict without forcing the
 * hand-written cast to invent fields it does not have.
 */
export const AuthoredCitizenSchema = z
  .object({
    id: z.string().regex(/^c-\d{4}$/, 'citizen ids look like c-0221'),
    name: z.string().min(1),
    archetype: z.string().min(1),
    post: z.string().min(1),
    temperament: z.enum(['afraid', 'indignant', 'rehearsed', 'drunk', 'helpful']),
    dread: z.number().min(0).max(1),
    papers: PapersSchema,
    irregularity: IrregularitySchema.nullable(),
    true_answers: z.record(z.string()),
    knowledge: z.array(z.string()).default([]),
  })
  .strict();

export const AuthoredCastSchema = z
  .object({
    citizens: z.array(AuthoredCitizenSchema).min(1),
    routines: z.record(z.array(z.string().min(1)).min(2)),
    /** authoring note; ignored by the loader, kept out of the runtime type */
    _note: z.string().optional(),
  })
  .strict();

export type AuthoredCast = z.infer<typeof AuthoredCastSchema>;

/** Bark sets are tone content: validate their shape, not their poetry. */
export const BarksSchema = z
  .object({
    loudspeaker: z.array(z.string().min(8)).min(1),
    radio: z.array(z.string().min(8)).min(1),
    ambient: z.array(z.string().min(8)).min(1),
    witness: z.array(z.string().min(4)).min(1),
  })
  .passthrough();

export const ContentBundleSchema = z.object({
  incidents: z.array(IncidentSchema).default([]),
  directives: z.array(DirectiveSchema).default([]),
  citizens: z.array(CitizenSchema).default([]),
  micro_events: z.array(StoryletSchema).default([]),
  report_tags: z.array(z.string()).default([]),
});

export type Papers = z.infer<typeof PapersSchema>;
export type CitizenDef = z.infer<typeof CitizenSchema>;
export type Storylet = z.infer<typeof StoryletSchema>;
export type Incident = z.infer<typeof IncidentSchema>;
export type Directive = z.infer<typeof DirectiveSchema>;
export type ContentBundle = z.infer<typeof ContentBundleSchema>;

/* ------------------------------------------------------------------ errors */

export class ContentError extends Error {
  constructor(
    public readonly file: string,
    public readonly path: string,
    message: string,
  ) {
    super(`${file}: ${path} — ${message}`);
    this.name = 'ContentError';
  }
}

/** Flatten zod issues into `path — message` strings. */
export function formatIssues(issues: z.ZodIssue[]): Array<{ path: string; message: string }> {
  return issues.map((i) => ({
    path: i.path.length ? i.path.join('.') : '(root)',
    message: i.message,
  }));
}

/* ------------------------------------------------------------------ loader */

export interface LoadedContent {
  bundle: ContentBundle;
  version: string;
  /** ids by collection, for O(1) lookup */
  byId: {
    citizens: Map<string, CitizenDef>;
    storylets: Map<string, Storylet>;
    incidents: Map<string, Incident>;
    directives: Map<string, Directive>;
  };
  /** diagnostics for authoring: ratios, duplicates, unresolved references */
  report: {
    connectiveTissueRatio: number;
    duplicateIds: string[];
    unresolvedReferences: string[];
    contradictionCycles: string[];
  };
}

/**
 * Validate a raw JSON object as a content bundle.
 * Throws ContentError with `file: path — message` for the first failure.
 */
export function parseContent(raw: unknown, file = 'content'): ContentBundle {
  const result = ContentBundleSchema.safeParse(raw);
  if (!result.success) {
    const first = formatIssues(result.error.issues)[0];
    throw new ContentError(file, first?.path ?? '(root)', first?.message ?? 'invalid content');
  }
  return result.data;
}

/**
 * Build the runtime content index. Performs the cross-collection checks that a
 * single schema cannot: duplicate ids, unresolved storylet references, and
 * directive contradiction cycles (P3-T11 requires cycles to be rejected).
 */
export function indexContent(bundle: ContentBundle, version = ContentVersion): LoadedContent {
  const duplicateIds: string[] = [];
  const add = <T extends { id: string }>(map: Map<string, T>, item: T, collection: string) => {
    if (map.has(item.id)) duplicateIds.push(`${collection}:${item.id}`);
    map.set(item.id, item);
  };

  const citizens = new Map<string, CitizenDef>();
  for (const c of bundle.citizens) add(citizens, c, 'citizens');

  const storylets = new Map<string, Storylet>();
  for (const s of bundle.micro_events) add(storylets, s, 'storylets');

  const incidents = new Map<string, Incident>();
  for (const i of bundle.incidents) add(incidents, i, 'incidents');

  const directives = new Map<string, Directive>();
  for (const d of bundle.directives) add(directives, d, 'directives');

  const unresolvedReferences: string[] = [];
  for (const s of bundle.micro_events) {
    for (const ref of s.references) {
      if (!storylets.has(ref)) unresolvedReferences.push(`${s.id} → ${ref}`);
    }
    // epilogue targets must exist
    for (const r of s.resolutions) {
      const epi = r.effects?.schedule_epilogue;
      if (epi && !storylets.has(epi)) unresolvedReferences.push(`${s.id} schedule_epilogue → ${epi}`);
    }
  }

  const contradictionCycles = findDirectiveCycles(bundle.directives);

  const referencing = bundle.micro_events.filter((s) => s.references.length > 0).length;
  const connectiveTissueRatio =
    bundle.micro_events.length === 0 ? 0 : referencing / bundle.micro_events.length;

  return {
    bundle: deepFreeze(bundle),
    version,
    byId: { citizens, storylets, incidents, directives },
    report: { connectiveTissueRatio, duplicateIds, unresolvedReferences, contradictionCycles },
  };
}

/** Depth-first search for cycles in the `contradicts` graph. */
export function findDirectiveCycles(directives: Directive[]): string[] {
  const graph = new Map<string, string[]>();
  for (const d of directives) graph.set(d.id, d.contradicts ?? []);
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  for (const id of graph.keys()) colour.set(id, WHITE);
  const cycles: string[] = [];

  const visit = (id: string, path: string[]): void => {
    colour.set(id, GREY);
    for (const next of graph.get(id) ?? []) {
      if (!graph.has(next)) continue;
      const c = colour.get(next);
      if (c === GREY) {
        cycles.push([...path, id, next].join(' → '));
      } else if (c === WHITE) {
        visit(next, [...path, id]);
      }
    }
    colour.set(id, BLACK);
  };

  for (const id of [...graph.keys()].sort()) {
    if (colour.get(id) === WHITE) visit(id, []);
  }
  return cycles;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/* --------------------------------------------------------- incidents (P2) */

const CrowdSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    agents: z.number().int().min(1).max(80),
    heat: z.number().min(0).max(1),
    leaders: z.array(z.string()).default([]),
    grievance: z.string().min(1),
    state: z.enum(['milling', 'chanting', 'surging', 'scattering', 'riot', 'dispersing']),
  })
  .strict();

const IncidentAnchorSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    interior: z.string().optional(),
    crowd: CrowdSchema.optional(),
    address: z.string().min(1),
    brief: z.string().min(1),
    quota: z.number().int().min(0).max(3).default(1),
  })
  .strict()
  .refine((a) => Boolean(a.interior) !== Boolean(a.crowd), {
    message: 'an anchor has exactly one of: interior, crowd',
  });

export const IncidentAnchorsSchema = z
  .object({
    id: z.string().min(1),
    note: z.string().optional(),
    anchors: z.array(IncidentAnchorSchema).min(1),
  })
  .strict();

export type IncidentAnchors = z.infer<typeof IncidentAnchorsSchema>;
