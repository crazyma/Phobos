/**
 * Pure display-formatting helpers (spec-02 §6).
 *
 * DB stores raw/UTC values; the UI renders localized Traditional-Chinese
 * strings. These functions are the single place that knows the display rules
 * (digit counts, innings notation, Asia/Taipei timezone) so pages and API
 * consumers stay consistent. No DB, no I/O — trivially unit-testable.
 */

/** Placeholder shown when a value is missing / not computable. */
export const DASH = "—";

type Nullable = number | null | undefined;

function isBad(value: Nullable): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/**
 * `ip_outs` (total outs recorded) → baseball innings notation「x.y 局」,
 * where y ∈ {0,1,2} is the leftover outs. e.g. 17 outs → "5.2 局".
 */
export function formatInningsPitched(ipOuts: Nullable): string {
  if (isBad(ipOuts)) return DASH;
  const outs = Math.trunc(ipOuts);
  const innings = Math.trunc(outs / 3);
  const remainder = outs % 3;
  return `${innings}.${remainder} 局`;
}

/**
 * AVG / OBP / SLG / OPS — three decimals, dropping the leading zero for
 * sub-1 values per baseball convention (.273), keeping it otherwise (1.052).
 */
export function formatRate3(value: Nullable): string {
  if (isBad(value)) return DASH;
  const fixed = value.toFixed(3);
  return value >= 0 && value < 1 ? fixed.replace(/^0/, "") : fixed;
}

/** ERA / FIP — two decimals, leading digit kept (3.14, 0.00, 12.50). */
export function formatEra(value: Nullable): string {
  if (isBad(value)) return DASH;
  return value.toFixed(2);
}

/** Fraction (e.g. 0.235 for BB%) → one-decimal percentage string ("23.5%"). */
export function formatPct(fraction: Nullable): string {
  if (isBad(fraction)) return DASH;
  return `${(fraction * 100).toFixed(1)}%`;
}

const taipeiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * UTC instant (Date | ISO string | epoch ms) → "YYYY-MM-DD HH:mm" in
 * Asia/Taipei. Formatting happens server-side to avoid client timezone drift.
 */
export function formatDateTimeTaipei(
  instant: Date | string | number | null | undefined,
): string {
  if (instant === null || instant === undefined) return DASH;
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return DASH;

  const parts = Object.fromEntries(
    taipeiFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
