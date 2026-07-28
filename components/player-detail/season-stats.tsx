import Link from "next/link";
import type { Season } from "@/lib/services";
import {
  DASH,
  formatEra,
  formatInningsPitched,
  formatPct,
  formatRate3,
} from "@/lib/format";
import {
  ADVANCED_BY_PERSPECTIVE,
  formatMetric,
  METRIC_LABELS,
  metricValue,
  type Perspective,
} from "@/lib/glossary/metrics";
import { metricSlug } from "@/lib/glossary/registry";

type BattingLine = Season["batting"][number]["rows"][number];
type PitchingLine = Season["pitching"][number]["rows"][number];

type Col<T> = { label: string; get: (line: T) => string | number; num?: boolean };

const BATTING_COLS: Col<BattingLine>[] = [
  { label: "G", get: (l) => l.g },
  { label: "PA", get: (l) => l.pa },
  { label: "AB", get: (l) => l.ab },
  { label: "H", get: (l) => l.h },
  { label: "2B", get: (l) => l.doubles },
  { label: "3B", get: (l) => l.triples },
  { label: "HR", get: (l) => l.hr },
  { label: "RBI", get: (l) => l.rbi },
  { label: "R", get: (l) => l.r },
  { label: "SB", get: (l) => l.sb },
  { label: "BB", get: (l) => l.bb },
  { label: "SO", get: (l) => l.so },
  { label: "AVG", get: (l) => formatRate3(l.avg), num: true },
  { label: "OBP", get: (l) => formatRate3(l.obp), num: true },
  { label: "SLG", get: (l) => formatRate3(l.slg), num: true },
  { label: "OPS", get: (l) => formatRate3(l.ops), num: true },
  { label: "ISO", get: (l) => formatRate3(l.iso), num: true },
  { label: "BB%", get: (l) => formatPct(l.bbPct), num: true },
  { label: "K%", get: (l) => formatPct(l.kPct), num: true },
  { label: "BABIP", get: (l) => formatRate3(l.babip), num: true },
];

const PITCHING_COLS: Col<PitchingLine>[] = [
  { label: "G", get: (l) => l.g },
  { label: "GS", get: (l) => l.gs },
  { label: "IP", get: (l) => formatInningsPitched(l.ipOuts) },
  { label: "W", get: (l) => l.w },
  { label: "L", get: (l) => l.l },
  { label: "SV", get: (l) => l.sv },
  { label: "HLD", get: (l) => l.hld },
  { label: "H", get: (l) => l.h },
  { label: "R", get: (l) => l.r },
  { label: "ER", get: (l) => l.er },
  { label: "HR", get: (l) => l.hr },
  { label: "BB", get: (l) => l.bb },
  { label: "SO", get: (l) => l.so },
  { label: "ERA", get: (l) => formatEra(l.era), num: true },
  { label: "WHIP", get: (l) => formatEra(l.whip), num: true },
  { label: "K/9", get: (l) => formatEra(l.k9), num: true },
  { label: "BB/9", get: (l) => formatEra(l.bb9), num: true },
  { label: "HR/9", get: (l) => formatEra(l.hr9), num: true },
  { label: "K%", get: (l) => formatPct(l.kPct), num: true },
  { label: "BB%", get: (l) => formatPct(l.bbPct), num: true },
];

function teamCell(line: { team: { name: string; abbrev: string | null } | null }): string {
  if (!line.team) return "合計";
  return line.team.abbrev ?? line.team.name;
}

function StatTable<T extends { team: { name: string; abbrev: string | null } | null }>({
  cols,
  rows,
  total,
}: {
  cols: Col<T>[];
  rows: T[];
  total: T | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-right text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">隊伍</th>
            {cols.map((c) => (
              <th key={c.label} className="px-2 py-1 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((line, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="px-2 py-1 text-left">{teamCell(line)}</td>
              {cols.map((c) => (
                <td key={c.label} className="px-2 py-1">
                  {c.get(line)}
                </td>
              ))}
            </tr>
          ))}
          {total && (
            <tr className="border-b border-border font-medium">
              <td className="px-2 py-1 text-left">合計</td>
              {cols.map((c) => (
                <td key={c.label} className="px-2 py-1">
                  {c.get(total)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Advanced metrics (spec-02 §2.3 / spec-04 §A): a secondary, expandable block
 * per level group. Missing values are hidden (advanced are mostly MLB-only, so
 * minor-league groups naturally show little or nothing → block hidden). Each
 * metric name links to its glossary page (bidirectional link; the slug comes
 * from the build-time registry, spec-04 §D). Shows the aggregate line —
 * the level total when a level spans teams, else the single team row.
 */
function AdvancedStats({
  perspective,
  line,
}: {
  perspective: Perspective;
  line: Record<string, unknown>;
}) {
  const items = ADVANCED_BY_PERSPECTIVE[perspective]
    .map((key) => ({ key, value: metricValue(line, key) }))
    .filter((m) => m.value !== null);
  if (items.length === 0) return null;

  return (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer text-muted-foreground select-none">進階數據</summary>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {items.map(({ key, value }) => (
          <li key={key}>
            <Link
              href={`/glossary/${metricSlug(key)}`}
              className="text-muted-foreground underline hover:text-foreground"
            >
              {METRIC_LABELS[key]}
            </Link>{" "}
            <span className="font-medium tabular-nums">{formatMetric(key, value)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Zone 2 (spec-02 §2.3): season stats, grouped by season, sectioned by level,
 * per-team rows + a recomputed level total, with an expandable advanced block
 * per group (spec-04). Low levels carry a "僅供參考" note.
 * `heading` lets the archived view relabel it「生涯總成績」.
 */
export function SeasonStats({
  seasons,
  heading = "球季數據",
}: {
  seasons: Season[];
  heading?: string;
}) {
  if (seasons.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="mt-2 text-sm text-muted-foreground">尚無球季數據。</p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <div className="mt-4 space-y-8">
        {seasons.map((season) => (
          <div key={season.season}>
            <h3 className="text-base font-semibold">{season.season}</h3>
            <div className="mt-2 space-y-5">
              {season.batting.map((group) => (
                <div key={`bat-${group.level}`}>
                  <p className="mb-1 text-sm font-medium text-muted-foreground">
                    {group.levelLabel}・打擊
                  </p>
                  <StatTable cols={BATTING_COLS} rows={group.rows} total={group.total} />
                  {group.isLowLevel && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      低階層級數據僅供參考。
                    </p>
                  )}
                  <AdvancedStats perspective="batter" line={group.total ?? group.rows[0]} />
                </div>
              ))}
              {season.pitching.map((group) => (
                <div key={`pit-${group.level}`}>
                  <p className="mb-1 text-sm font-medium text-muted-foreground">
                    {group.levelLabel}・投球
                  </p>
                  <StatTable cols={PITCHING_COLS} rows={group.rows} total={group.total} />
                  {group.isLowLevel && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      低階層級數據僅供參考。
                    </p>
                  )}
                  <AdvancedStats perspective="pitcher" line={group.total ?? group.rows[0]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
