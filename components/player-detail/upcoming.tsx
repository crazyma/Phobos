import type { Upcoming } from "@/lib/services";
import { DASH, formatDateTimeTaipei } from "@/lib/format";

const TAG_LABELS: Record<NonNullable<Upcoming>["tag"], string> = {
  probable_starter: "確定先發",
  possible: "可能出賽",
  il: "傷兵中",
};

const TAG_CLASS: Record<NonNullable<Upcoming>["tag"], string> = {
  probable_starter: "border-accent bg-accent text-accent-foreground",
  possible: "border-accent bg-transparent text-accent",
  il: "border-down bg-down text-primary-foreground",
};

function opponentName(o: { abbrev: string | null; name: string } | null): string {
  return o ? (o.abbrev ?? o.name) : DASH;
}

/**
 * Zone 5 (spec-02 §2.3): the next-game prediction tag, the next scheduled game
 * (with series context), and the team's recent results. Hidden for archived
 * players by the page.
 */
export function Upcoming({ upcoming }: { upcoming: Upcoming }) {
  if (!upcoming) {
    return (
      <section className="mt-16">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">UP NEXT</p>
        <h2 className="font-serif text-3xl font-black tracking-tight">出賽預告</h2>
        <p className="mt-2 text-sm text-muted-foreground">目前無所屬球隊。</p>
      </section>
    );
  }

  const { tag, nextGame, recentResults } = upcoming;

  return (
    <section className="mt-16">
      <div className="mb-6">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">UP NEXT</p>
        <h2 className="font-serif text-3xl font-black tracking-tight">出賽預告</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-foreground pt-5">
        <span className={`rounded-full border px-3 py-1.5 font-mono text-xs font-bold ${TAG_CLASS[tag]}`}>{TAG_LABELS[tag]}</span>
        {nextGame && (
          <span className="font-serif text-xl font-black text-foreground">
            {nextGame.isHome === false ? "客場 @ " : "主場 vs "}
            {opponentName(nextGame.opponent)}
            {nextGame.gamesInSeries && nextGame.seriesGameNumber
              ? `（系列賽第 ${nextGame.seriesGameNumber}/${nextGame.gamesInSeries} 戰）`
              : ""}
          </span>
        )}
      </div>

      {nextGame && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          {formatDateTimeTaipei(nextGame.startTimeUtc)}（台灣時間）
          {nextGame.venueName ? `・${nextGame.venueName}` : ""}
        </p>
      )}
      {!nextGame && (
        <p className="mt-1 text-sm text-muted-foreground">尚無排定的下一場比賽。</p>
      )}

      {recentResults.length > 0 && (
        <div className="mt-4">
          <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">近期戰績</p>
          <ul className="space-y-2 text-sm tabular-nums">
            {recentResults.map((g) => (
              <li key={g.gamePk} className="flex items-center gap-2">
                <span className="w-14 text-muted-foreground">{g.gameDate.slice(5)}</span>
                <span
                  className={
                    g.win === true ? "font-medium text-up" : g.win === false ? "text-down" : "text-muted-foreground"
                  }
                >
                  {g.win === true ? "勝" : g.win === false ? "敗" : "—"}
                </span>
                <span className="text-muted-foreground">
                  {g.isHome === false ? "@" : "vs"} {opponentName(g.opponent)}
                  {g.teamScore !== null && g.opponentScore !== null
                    ? ` ${g.teamScore}-${g.opponentScore}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
