/**
 * Glossary term frontmatter contract (spec-04 §B). The MDX file is the single
 * source of truth; this Zod schema validates every term at load/build time —
 * fields complete, `bands` only mlb/aaa/aa, each band range ascending, and the
 * band perspectives matching `applies_to`. Roster terms carry no metric_keys
 * and no bands.
 */
import { z } from "zod";

export const GLOSSARY_CATEGORIES = [
  "batting_adv",
  "pitching_adv",
  "shared_adv",
  "standard",
  "roster",
] as const;

export const PERSPECTIVES = ["batter", "pitcher"] as const;

/** One band: an upper bound (inclusive) + label; the last band omits `max`. */
const BandSchema = z.object({
  max: z.number().optional(),
  label: z.string().min(1),
});

/**
 * A level's bands: at least one, ascending by `max`, and only the last may be
 * open-ended (omit `max`). Ascending order is what makes the band-label lookup
 * (spec-04 §E) unambiguous regardless of `higher_is_better`.
 */
const LevelBandsSchema = z.array(BandSchema).min(1).superRefine((bands, ctx) => {
  bands.forEach((band, i) => {
    const isLast = i === bands.length - 1;
    if (band.max === undefined && !isLast) {
      ctx.addIssue({ code: "custom", message: "only the last band may omit `max`" });
    }
    if (i > 0) {
      const prev = bands[i - 1].max;
      if (prev !== undefined && band.max !== undefined && band.max <= prev) {
        ctx.addIssue({ code: "custom", message: "band `max` values must ascend" });
      }
    }
  });
});

/** Bands for one perspective across the three graded levels (spec-04 §C). */
const LevelBandSetSchema = z
  .object({
    mlb: LevelBandsSchema,
    aaa: LevelBandsSchema,
    aa: LevelBandsSchema,
  })
  .strict();

const BandsSchema = z
  .object({
    batter: LevelBandSetSchema.optional(),
    pitcher: LevelBandSetSchema.optional(),
  })
  .strict();

const SourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

export const FrontmatterSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
    name_zh: z.string().min(1),
    name_en: z.string().min(1),
    category: z.enum(GLOSSARY_CATEGORIES),
    applies_to: z.array(z.enum(PERSPECTIVES)).min(1),
    /** spec-01 data keys; empty only for roster terms. */
    metric_keys: z.array(z.string().min(1)),
    higher_is_better: z.boolean(),
    /**
     * Pitcher-view good-direction, when it differs from the batter/default
     * `higher_is_better`. Shared metrics invert by perspective (a batter wants a
     * high BB%, a pitcher a low one); this override lets the example picker sort
     * each side correctly. Optional — falls back to `higher_is_better`.
     */
    higher_is_better_pitcher: z.boolean().optional(),
    /** One-line 白話 used on the /glossary index. */
    blurb: z.string().min(1),
    /** Definition/formula small-text (spec-04 §B layer 2); roster omits. */
    formula: z.string().optional(),
    bands: BandsSchema.optional(),
    sources: z.array(SourceSchema).min(1),
  })
  .superRefine((fm, ctx) => {
    const isRoster = fm.category === "roster";
    if (isRoster) {
      if (fm.metric_keys.length > 0) {
        ctx.addIssue({ code: "custom", path: ["metric_keys"], message: "roster terms have no metric_keys" });
      }
      if (fm.bands) {
        ctx.addIssue({ code: "custom", path: ["bands"], message: "roster terms have no bands" });
      }
      return;
    }
    // Metric terms: at least one key, bands present, and band perspectives
    // exactly matching applies_to (spec-04 §A shared terms carry both).
    if (fm.metric_keys.length === 0) {
      ctx.addIssue({ code: "custom", path: ["metric_keys"], message: "metric terms need ≥1 metric_key" });
    }
    if (!fm.bands) {
      ctx.addIssue({ code: "custom", path: ["bands"], message: "metric terms need bands" });
      return;
    }
    const bandPerspectives = Object.keys(fm.bands).sort();
    const applies = [...fm.applies_to].sort();
    if (bandPerspectives.join(",") !== applies.join(",")) {
      ctx.addIssue({
        code: "custom",
        path: ["bands"],
        message: `bands perspectives (${bandPerspectives.join(",")}) must match applies_to (${applies.join(",")})`,
      });
    }
  });

export type Frontmatter = z.infer<typeof FrontmatterSchema>;
export type Band = z.infer<typeof BandSchema>;
export type Perspective = (typeof PERSPECTIVES)[number];
export type LevelBandSet = z.infer<typeof LevelBandSetSchema>;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

/** Graded levels, in display/priority order (spec-04 §C/§E). */
export const GRADED_LEVELS = ["mlb", "aaa", "aa"] as const;
export type GradedLevel = (typeof GRADED_LEVELS)[number];
