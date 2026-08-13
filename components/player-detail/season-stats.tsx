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
import { isGraded } from "@/lib/glossary/schema";
import { bandLabel } from "@/lib/glossary/bands";
import { loadFrontmatter } from "@/lib/glossary/content";
import { LevelBadge } from "@/components/magazine/level-badge";

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

type FocusStat = { label: string; value: string; hint?: string };

const STANDARD_SLUG: Record<string, string> = {
  AVG: "avg",
  OPS: "ops",
  ERA: "era",
  WHIP: "whip",
};

/** Read an authored glossary band; ungraded levels and prose-only terms stay blank. */
function authoredBand(
  slug: string,
  perspective: Perspective,
  level: string,
  value: number | null,
): string | undefined {
  if (value === null || !isGraded(level)) return undefined;
  const bands = loadFrontmatter(slug)?.bands?.[perspective]?.[level];
  return bands ? bandLabel(bands, value) : undefined;
}

function standardHint(label: string, perspective: Perspective, level: string, value: number | null) {
  const slug = STANDARD_SLUG[label];
  return slug ? authoredBand(slug, perspective, level, value) : undefined;
}

function FocusBlock({ stat }: { stat: FocusStat }) {
  return (
    <div className="border-l-2 border-accent pl-4">
      <p className="font-mono text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {stat.label}
      </p>
      <p className="mt-1 font-mono text-4xl font-black leading-none text-foreground">
        {stat.value}
      </p>
      {stat.hint && <p className="mt-2 text-[11px] leading-tight text-muted-foreground">{stat.hint}</p>}
    </div>
  );
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
      <table className="w-full min-w-[52rem] border-collapse text-right text-xs tabular-nums">
        <thead>
          <tr className="border-y-2 border-foreground text-muted-foreground">
            <th className="sticky left-0 z-10 bg-background px-2 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest">隊伍</th>
            {cols.map((c) => (
              <th key={c.label} className="px-2 py-3 font-mono text-[10px] font-bold uppercase tracking-widest">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((line, i) => (
            <tr key={i} className="border-t border-border">
              <td className="sticky left-0 z-10 bg-background px-2 py-3 text-left font-serif font-black">{teamCell(line)}</td>
              {cols.map((c) => (
                <td key={c.label} className="px-2 py-3 font-mono">
                  {c.get(line)}
                </td>
              ))}
            </tr>
          ))}
          {total && (
            <tr className="border-y-2 border-foreground font-medium">
              <td className="sticky left-0 z-10 bg-background px-2 py-3 text-left font-serif font-black">合計</td>
              {cols.map((c) => (
                <td key={c.label} className="px-2 py-3 font-mono">
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

function FullTable<T extends { team: { name: string; abbrev: string | null } | null }>({
  label,
  cols,
  rows,
  total,
}: {
  label: string;
  cols: Col<T>[];
  rows: T[];
  total: T | null;
}) {
  return (
    <details className="mt-6 border-t border-border pt-3">
      <summary className="cursor-pointer list-none font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground [&::-webkit-details-marker]:hidden">
        展開完整數據表 · {label}
      </summary>
      <p className="mt-3 font-mono text-[11px] text-muted-foreground lg:hidden">← 左右滑動查看更多欄位 →</p>
      <div className="mt-3">
        <StatTable cols={cols} rows={rows} total={total} />
      </div>
    </details>
  );
}

function BattingFocus({ line, level }: { line: BattingLine; level: string }): FocusStat[] {
  return [
    { label: "AVG", value: formatRate3(line.avg), hint: standardHint("AVG", "batter", level, line.avg) },
    { label: "OPS", value: formatRate3(line.ops), hint: standardHint("OPS", "batter", level, line.ops) },
    { label: "HR", value: String(line.hr) },
    { label: "RBI", value: String(line.rbi) },
  ];
}

function PitchingFocus({ line, level }: { line: PitchingLine; level: string }): FocusStat[] {
  return [
    { label: "ERA", value: formatEra(line.era), hint: standardHint("ERA", "pitcher", level, line.era) },
    { label: "WHIP", value: formatEra(line.whip), hint: standardHint("WHIP", "pitcher", level, line.whip) },
    { label: "SO", value: String(line.so) },
    { label: "IP", value: formatInningsPitched(line.ipOuts) },
  ];
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
  level,
}: {
  perspective: Perspective;
  line: Record<string, unknown>;
  level: string;
}) {
  const items = ADVANCED_BY_PERSPECTIVE[perspective]
    .map((key) => ({ key, value: metricValue(line, key) }))
    .filter((m) => m.value !== null);
  if (items.length === 0) return null;

  return (
    <details className="mt-6 border-t border-border pt-3">
      <summary className="cursor-pointer list-none font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground [&::-webkit-details-marker]:hidden">進階數據</summary>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ key, value }) => (
          <div key={key} className="border-l-2 border-accent pl-4">
            <Link
              href={`/glossary/${metricSlug(key)}`}
              className="font-mono text-sm font-bold uppercase tracking-widest text-muted-foreground underline hover:text-foreground"
            >
              {METRIC_LABELS[key]}
            </Link>{" "}
            <p className="mt-1 font-mono text-3xl font-black tabular-nums">{formatMetric(key, value)}</p>
            {(() => {
              const hint = authoredBand(metricSlug(key), perspective, level, value);
              return hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null;
            })()}
          </div>
        ))}
      </div>
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
  currentTeamId = null,
}: {
  seasons: Season[];
  heading?: string;
  currentTeamId?: number | null;
}) {
  if (seasons.length === 0) {
    return (
      <section className="mt-16">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">SEASON STATS</p>
        <h2 className="font-serif text-3xl font-black tracking-tight">{heading}</h2>
        <p className="mt-2 text-sm text-muted-foreground">尚無球季數據。</p>
      </section>
    );
  }

  return (
    <section className="mt-16">
      <div className="mb-8">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">SEASON STATS</p>
        <h2 className="font-serif text-3xl font-black tracking-tight">{heading}</h2>
      </div>
      <div className="space-y-12">
        {seasons.map((season) => (
          <div key={season.season}>
            <h3 className="border-b-2 border-foreground pb-3 font-serif text-2xl font-black">{season.season}</h3>
            <div className="mt-6 space-y-10">
              {season.batting.map((group) => (
                <div key={`bat-${group.level}`}>
                  {(() => {
                    const line = group.total ?? group.rows[0];
                    if (!line) return null;
                    const current = currentTeamId !== null && group.rows.some((r) => r.team?.id === currentTeamId);
                    return (
                      <>
                        <div className="mb-5 flex flex-wrap items-center gap-3">
                          <LevelBadge level={group.level} />
                          <span className="font-serif text-xl font-black">打擊</span>
                          <span className="font-mono text-xs text-muted-foreground">{line.g} 場</span>
                          {current && <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-widest text-accent">目前所在</span>}
                        </div>
                        <div className="grid gap-5 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
                          {BattingFocus({ line, level: group.level }).map((stat) => <FocusBlock key={stat.label} stat={stat} />)}
                        </div>
                        <FullTable label={`${group.levelLabel}・打擊`} cols={BATTING_COLS} rows={group.rows} total={group.total} />
                      </>
                    );
                  })()}
                  {group.isLowLevel && (
                    <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                      低階層級數據僅供參考。
                    </p>
                  )}
                  <AdvancedStats perspective="batter" level={group.level} line={group.total ?? group.rows[0]} />
                </div>
              ))}
              {season.pitching.map((group) => (
                <div key={`pit-${group.level}`}>
                  {(() => {
                    const line = group.total ?? group.rows[0];
                    if (!line) return null;
                    const current = currentTeamId !== null && group.rows.some((r) => r.team?.id === currentTeamId);
                    return (
                      <>
                        <div className="mb-5 flex flex-wrap items-center gap-3">
                          <LevelBadge level={group.level} />
                          <span className="font-serif text-xl font-black">投球</span>
                          <span className="font-mono text-xs text-muted-foreground">{line.g} 場</span>
                          {current && <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-widest text-accent">目前所在</span>}
                        </div>
                        <div className="grid gap-5 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
                          {PitchingFocus({ line, level: group.level }).map((stat) => <FocusBlock key={stat.label} stat={stat} />)}
                        </div>
                        <FullTable label={`${group.levelLabel}・投球`} cols={PITCHING_COLS} rows={group.rows} total={group.total} />
                      </>
                    );
                  })()}
                  {group.isLowLevel && (
                    <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                      低階層級數據僅供參考。
                    </p>
                  )}
                  <AdvancedStats perspective="pitcher" level={group.level} line={group.total ?? group.rows[0]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
