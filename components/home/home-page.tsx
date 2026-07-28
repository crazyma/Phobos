import Link from "next/link";
import { formatDateTimeTaipei, formatInningsPitched } from "@/lib/format";
import type { Home } from "@/lib/services";

function GameLine({ card }: { card: Home["gameCards"][number] }) {
  if (card.role === "batting") {
    const line = card.line as { pa: number; h: number; hr: number; rbi: number; bb: number; so: number };
    return <span>打席 {line.pa}・{line.h} 安・{line.hr} 轟・{line.rbi} 打點・{line.bb} 保送・{line.so} 三振</span>;
  }
  const line = card.line as { ipOuts: number; h: number; r: number; er: number; so: number; bb: number };
  return <span>{formatInningsPitched(line.ipOuts)}・{line.h} 安・{line.r} 失分・{line.er} 自責・{line.so} 三振・{line.bb} 保送</span>;
}

const UPCOMING_TAGS = {
  probable_starter: "確定先發",
  possible: "可能出賽",
  il: "傷兵中",
};

/** Server-safe presentation for the homepage's four zones. */
export function HomePageView({ home }: { home: Home }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">台灣球員動態</h1>
        <p className="mt-1 text-sm text-muted-foreground">追蹤台灣球員每天的賽況、異動與下一場比賽。</p>
      </header>

      <section className="mt-8" aria-labelledby="latest-results">
        <h2 id="latest-results" className="text-lg font-semibold">最新賽況</h2>
        {home.digestDate && home.gameCards.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">美國比賽日 {home.digestDate}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {home.gameCards.map((card, index) => (
                <article key={`${card.playerId}-${card.role}-${index}`} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/players/${card.playerId}`} className="font-medium hover:underline">{card.nameZh}</Link>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {card.teamAbbrev ?? "—"}・{card.level.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-3 text-sm"><GameLine card={card} /></p>
                  <p className="mt-2 text-sm text-muted-foreground">{card.recentForm}</p>
                </article>
              ))}
            </div>
          </>
        ) : home.emptyState ? (
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="font-medium">本季／上季回顧</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {home.emptyState.seasonReviewCards.map((card) => (
                  <article key={card.playerId} className="rounded-lg border border-border bg-card p-4">
                    <Link href={`/players/${card.playerId}`} className="font-medium hover:underline">{card.nameZh}</Link>
                    <p className="mt-1 text-xs text-muted-foreground">{card.season ? `${card.season} 球季` : "尚無球季成績"}</p>
                    {card.batting && <p className="mt-3 text-sm">打擊：{card.batting.g} 場・{card.batting.h} 安・{card.batting.hr} 轟・{card.batting.rbi} 打點</p>}
                    {card.pitching && <p className="mt-3 text-sm">投球：{card.pitching.g} 場・{formatInningsPitched(card.pitching.ipOuts)}・{card.pitching.so} 三振</p>}
                    <p className="mt-2 text-sm text-muted-foreground">{card.recentForm}</p>
                  </article>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-medium">棒球名詞</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                {home.emptyState.glossaryPicks.map((pick) => (
                  <li key={pick.link} className="rounded-lg border border-border p-4">
                    <Link href={pick.link} className="font-medium hover:underline">{pick.nameZh}（{pick.nameEn}）</Link>
                    <p className="mt-2 text-sm text-muted-foreground">{pick.blurb}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">近期無賽事</p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="transactions">
        <h2 id="transactions" className="text-lg font-semibold">球員動態</h2>
        {home.events.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {home.events.map((event) => (
              <li key={`${event.playerId}-${event.date}-${event.type}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
                <time className="text-muted-foreground">{event.date}</time>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{event.typeLabel}</span>
                <Link href={`/players/${event.playerId}`} className="font-medium hover:underline">{event.nameZh}</Link>
                {event.description && <span className="text-muted-foreground">{event.description}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">近期沒有球員異動。</p>
        )}
      </section>
      <section className="mt-10" aria-labelledby="upcoming-games">
        <h2 id="upcoming-games" className="text-lg font-semibold">即將出賽</h2>
        {home.upcoming.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {home.upcoming.map((entry) => (
              <li key={entry.playerId} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
                <Link href={`/players/${entry.playerId}`} className="font-medium hover:underline">{entry.nameZh}</Link>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{UPCOMING_TAGS[entry.tag]}</span>
                {entry.tag !== "il" && (
                  <span className="text-muted-foreground">
                    {entry.opponent ? `對 ${entry.opponent}` : "賽程待定"}
                    {entry.startTimeUtc ? `・${formatDateTimeTaipei(entry.startTimeUtc)}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">目前沒有即將出賽的賽程。</p>
        )}
      </section>
    </section>
  );
}
