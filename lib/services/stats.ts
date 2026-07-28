/**
 * Pure derivation of standard rate stats from counting columns (spec-01 C.7,
 * spec-02 §2.3). Ratios are never stored — services compute them at read time.
 * Every rate is null when its denominator is 0 (so the UI shows a dash, not
 * NaN). Level-total rows recompute rates from summed counting, never by
 * averaging the per-team rates.
 */

export type BattingCounting = {
  g: number;
  pa: number;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  r: number;
  sb: number;
  cs: number;
  bb: number;
  so: number;
  hbp: number;
  sf: number;
};

export type BattingRates = {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  iso: number | null;
  bbPct: number | null;
  kPct: number | null;
  babip: number | null;
};

export type PitchingCounting = {
  g: number;
  gs: number;
  ipOuts: number;
  bf: number;
  h: number;
  r: number;
  er: number;
  hr: number;
  bb: number;
  so: number;
  w: number;
  l: number;
  sv: number;
  hld: number;
};

export type PitchingRates = {
  era: number | null;
  whip: number | null;
  hr9: number | null;
  k9: number | null;
  bb9: number | null;
  kPct: number | null;
  bbPct: number | null;
};

const div = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** Standard batting rates from counting stats. */
export function deriveBatting(c: BattingCounting): BattingRates {
  const totalBases = c.h + c.doubles + 2 * c.triples + 3 * c.hr;
  const avg = div(c.h, c.ab);
  const obp = div(c.h + c.bb + c.hbp, c.ab + c.bb + c.hbp + c.sf);
  const slg = div(totalBases, c.ab);
  return {
    avg,
    obp,
    slg,
    ops: obp !== null && slg !== null ? obp + slg : null,
    iso: avg !== null && slg !== null ? slg - avg : null,
    bbPct: div(c.bb, c.pa),
    kPct: div(c.so, c.pa),
    babip: div(c.h - c.hr, c.ab - c.so - c.hr + c.sf),
  };
}

/** Standard pitching rates from counting stats (per-9 use outs = IP×3). */
export function derivePitching(c: PitchingCounting): PitchingRates {
  const outs = c.ipOuts;
  const per9 = (n: number) => (outs > 0 ? (n * 27) / outs : null);
  return {
    era: per9(c.er),
    whip: outs > 0 ? ((c.h + c.bb) * 3) / outs : null,
    hr9: per9(c.hr),
    k9: per9(c.so),
    bb9: per9(c.bb),
    kPct: div(c.so, c.bf),
    bbPct: div(c.bb, c.bf),
  };
}

const BATTING_KEYS: (keyof BattingCounting)[] = [
  "g", "pa", "ab", "h", "doubles", "triples", "hr", "rbi", "r", "sb", "cs",
  "bb", "so", "hbp", "sf",
];

const PITCHING_KEYS: (keyof PitchingCounting)[] = [
  "g", "gs", "ipOuts", "bf", "h", "r", "er", "hr", "bb", "so", "w", "l", "sv", "hld",
];

/** Sum counting rows into a level total (rates get recomputed from this). */
export function sumBatting(rows: BattingCounting[]): BattingCounting {
  const out = Object.fromEntries(BATTING_KEYS.map((k) => [k, 0])) as BattingCounting;
  for (const row of rows) for (const k of BATTING_KEYS) out[k] += row[k];
  return out;
}

export function sumPitching(rows: PitchingCounting[]): PitchingCounting {
  const out = Object.fromEntries(PITCHING_KEYS.map((k) => [k, 0])) as PitchingCounting;
  for (const row of rows) for (const k of PITCHING_KEYS) out[k] += row[k];
  return out;
}
