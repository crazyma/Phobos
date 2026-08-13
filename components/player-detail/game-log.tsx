import type { GameLog } from "@/lib/services";
import { DASH, formatEra, formatInningsPitched, formatRate3 } from "@/lib/format";

type BattingGame = GameLog["batting"][number];
type PitchingGame = GameLog["pitching"][number];

/** "2026-07-26" → "7/26" for a compact game-log date. */
function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return m && day ? `${Number(m)}/${Number(day)}` : d;
}

function vs(g: { isHome: boolean | null; opponent: { abbrev: string | null; name: string } | null }): string {
  if (!g.opponent) return DASH;
  const at = g.isHome === false ? "@" : "vs";
  return `${at} ${g.opponent.abbrev ?? g.opponent.name}`;
}

type Stat = { label: string; value: string };

function StatList({
  title,
  rows,
  stats,
}: {
  title: string;
  rows: BattingGame[] | PitchingGame[];
  stats: (row: BattingGame | PitchingGame) => Stat[];
}) {
  return (
    <div className="border-t-2 border-foreground">
      <p className="py-3 font-serif text-xl font-black">{title}</p>
      {rows.map((g) => (
        <div key={g.gamePk} className="flex flex-col gap-4 border-b border-border py-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 lg:w-56 lg:shrink-0">
            <span className="font-mono text-lg font-black text-accent">{shortDate(g.gameDate)}</span>
            <span className="font-mono text-xs font-bold text-muted-foreground">{vs(g)}</span>
          </div>
          <div className="flex flex-1 flex-wrap gap-x-8 gap-y-3">
            {stats(g).map((stat) => (
              <div key={stat.label} className="min-w-[3rem]">
                <span className="font-mono text-2xl font-black leading-none text-foreground">{stat.value}</span>
                <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Zone 3 (spec-02 §2.3): recent box lines, batting and pitching split. A
 * two-way player shows both tables. Dates are US game days, shown compactly.
 */
export function GameLog({ gameLog }: { gameLog: GameLog }) {
  const hasBatting = gameLog.batting.length > 0;
  const hasPitching = gameLog.pitching.length > 0;

  return (
    <section className="mt-16">
      <div className="mb-6">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">GAME LOG</p>
        <h2 className="font-serif text-3xl font-black tracking-tight">近期比賽紀錄</h2>
      </div>
      {!hasBatting && !hasPitching ? (
        <p className="mt-2 text-sm text-muted-foreground">尚無逐場成績。</p>
      ) : (
        <div className="space-y-8">
          {hasBatting && (
            <StatList title="打擊" rows={gameLog.batting} stats={(g) => {
              const row = g as BattingGame;
              return [
                { label: "AB", value: String(row.ab) },
                { label: "H", value: String(row.h) },
                { label: "HR", value: String(row.hr) },
                { label: "RBI", value: String(row.rbi) },
                { label: "OPS", value: formatRate3(row.ops) },
              ];
            }} />
          )}
          {hasPitching && (
            <StatList title="投球" rows={gameLog.pitching} stats={(g) => {
              const row = g as PitchingGame;
              return [
                { label: "IP", value: formatInningsPitched(row.ipOuts) },
                { label: "H", value: String(row.h) },
                { label: "ER", value: String(row.er) },
                { label: "SO", value: String(row.so) },
                { label: "ERA", value: formatEra(row.era) },
              ];
            }} />
          )}
        </div>
      )}
    </section>
  );
}
