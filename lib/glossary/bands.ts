/**
 * Band-label lookup (spec-04 §E). Bands are authored ascending by `max`
 * (schema-enforced), so the first band whose `max` the value doesn't exceed
 * wins; the open-ended last band catches the rest. Direction is already baked
 * into the labels, so this is correct for both higher-/lower-is-better metrics.
 */
import type { Band, GradedLevel } from "./schema.ts";

/** Human column header for a graded level. */
export const LEVEL_HEADERS: Record<GradedLevel, string> = {
  mlb: "MLB",
  aaa: "3A",
  aa: "2A",
};

/** The label whose band a value falls into. */
export function bandLabel(bands: Band[], value: number): string {
  for (const band of bands) {
    if (band.max === undefined || value <= band.max) return band.label;
  }
  return bands[bands.length - 1].label;
}
