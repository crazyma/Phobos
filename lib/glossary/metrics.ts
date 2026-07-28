/**
 * The player page's advanced-metric display config (spec-02 §2.3 zone 2 /
 * spec-04 §A, §D). Batter 7 + pitcher 7; four are shared (WAR, BB%, K%, BABIP)
 * so the 14 slots resolve to 10 distinct `metric_key`s — the set the glossary
 * registry must fully cover, else the build fails.
 */
import { DASH, formatEra, formatPct, formatRate3 } from "@/lib/format";
import type { Perspective } from "./schema.ts";

export type { Perspective };

export type MetricKey =
  | "wrc_plus"
  | "woba"
  | "iso"
  | "war"
  | "bb_pct"
  | "k_pct"
  | "babip"
  | "fip"
  | "hr9"
  | "lob_pct";

/** Ordered advanced metrics shown for each perspective (spec-04 §A: 各 7 項). */
export const BATTER_ADVANCED: MetricKey[] = [
  "wrc_plus", "woba", "iso", "bb_pct", "k_pct", "babip", "war",
];
export const PITCHER_ADVANCED: MetricKey[] = [
  "fip", "hr9", "lob_pct", "k_pct", "bb_pct", "babip", "war",
];

export const ADVANCED_BY_PERSPECTIVE: Record<Perspective, MetricKey[]> = {
  batter: BATTER_ADVANCED,
  pitcher: PITCHER_ADVANCED,
};

/**
 * Every `metric_key` the player page can display (spec-04 §D "顯示指標清單").
 * The glossary registry must map each of these to a term page or the build
 * fails — the mechanical guarantee behind "名詞頁先行".
 */
export const PLAYER_DISPLAY_METRICS: MetricKey[] = [
  ...new Set<MetricKey>([...BATTER_ADVANCED, ...PITCHER_ADVANCED]),
];

/** Link text on the player page + the term's display name. */
export const METRIC_LABELS: Record<MetricKey, string> = {
  wrc_plus: "wRC+",
  woba: "wOBA",
  iso: "ISO",
  war: "WAR",
  bb_pct: "BB%",
  k_pct: "K%",
  babip: "BABIP",
  fip: "FIP",
  hr9: "HR/9",
  lob_pct: "LOB%",
};

/** `metric_key` → the field name it reads off a season line (batting/pitching). */
const METRIC_FIELD: Record<MetricKey, string> = {
  wrc_plus: "wrcPlus",
  woba: "woba",
  iso: "iso",
  war: "war",
  bb_pct: "bbPct",
  k_pct: "kPct",
  babip: "babip",
  fip: "fip",
  hr9: "hr9",
  lob_pct: "lobPct",
};

/** Read a metric off a season line; null when absent/not a number (→ hidden). */
export function metricValue(
  line: Record<string, unknown>,
  key: MetricKey,
): number | null {
  const v = line[METRIC_FIELD[key]];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

/** Format a metric for display, per its natural scale (spec-02 §6). */
export function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null || Number.isNaN(value)) return DASH;
  switch (key) {
    case "wrc_plus":
      return String(Math.round(value));
    case "war":
      return value.toFixed(1);
    case "fip":
    case "hr9":
      return formatEra(value);
    case "bb_pct":
    case "k_pct":
    case "lob_pct":
      return formatPct(value);
    case "woba":
    case "iso":
    case "babip":
      return formatRate3(value);
  }
}
