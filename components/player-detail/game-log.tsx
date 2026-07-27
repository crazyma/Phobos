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

function BattingTable({ rows }: { rows: BattingGame[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-right text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">日期</th>
            <th className="px-2 py-1 text-left font-medium">對手</th>
            {["AB", "H", "2B", "3B", "HR", "RBI", "R", "BB", "SO", "SB", "OPS"].map((c) => (
              <th key={c} className="px-2 py-1 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.gamePk} className="border-b border-border/50">
              <td className="px-2 py-1 text-left">{shortDate(g.gameDate)}</td>
              <td className="px-2 py-1 text-left">{vs(g)}</td>
              <td className="px-2 py-1">{g.ab}</td>
              <td className="px-2 py-1">{g.h}</td>
              <td className="px-2 py-1">{g.doubles}</td>
              <td className="px-2 py-1">{g.triples}</td>
              <td className="px-2 py-1">{g.hr}</td>
              <td className="px-2 py-1">{g.rbi}</td>
              <td className="px-2 py-1">{g.r}</td>
              <td className="px-2 py-1">{g.bb}</td>
              <td className="px-2 py-1">{g.so}</td>
              <td className="px-2 py-1">{g.sb}</td>
              <td className="px-2 py-1">{formatRate3(g.ops)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitchingTable({ rows }: { rows: PitchingGame[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-right text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">日期</th>
            <th className="px-2 py-1 text-left font-medium">對手</th>
            {["IP", "H", "R", "ER", "BB", "SO", "HR", "ERA", "WHIP"].map((c) => (
              <th key={c} className="px-2 py-1 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.gamePk} className="border-b border-border/50">
              <td className="px-2 py-1 text-left">{shortDate(g.gameDate)}</td>
              <td className="px-2 py-1 text-left">{vs(g)}</td>
              <td className="px-2 py-1">{formatInningsPitched(g.ipOuts)}</td>
              <td className="px-2 py-1">{g.h}</td>
              <td className="px-2 py-1">{g.r}</td>
              <td className="px-2 py-1">{g.er}</td>
              <td className="px-2 py-1">{g.bb}</td>
              <td className="px-2 py-1">{g.so}</td>
              <td className="px-2 py-1">{g.hr}</td>
              <td className="px-2 py-1">{formatEra(g.era)}</td>
              <td className="px-2 py-1">{formatEra(g.whip)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    <section className="mt-8">
      <h2 className="text-lg font-semibold">逐場成績</h2>
      {!hasBatting && !hasPitching ? (
        <p className="mt-2 text-sm text-muted-foreground">尚無逐場成績。</p>
      ) : (
        <div className="mt-4 space-y-5">
          {hasBatting && (
            <div>
              <p className="mb-1 text-sm font-medium text-muted-foreground">打擊</p>
              <BattingTable rows={gameLog.batting} />
            </div>
          )}
          {hasPitching && (
            <div>
              <p className="mb-1 text-sm font-medium text-muted-foreground">投球</p>
              <PitchingTable rows={gameLog.pitching} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
