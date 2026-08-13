import Link from "next/link";
import { formatDateTimeTaipei, formatInningsPitched } from "@/lib/format";
import type { Home } from "@/lib/services";
import { EmptyState } from "@/components/magazine/empty-state";
import { LevelBadge } from "@/components/magazine/level-badge";
import { eventTone } from "@/components/magazine/event-tone";

const UPCOMING_TAGS = {
  probable_starter: { label: "確定先發", className: "border-accent bg-accent text-accent-foreground" },
  possible: { label: "可能出賽", className: "border-accent bg-transparent text-accent" },
  il: { label: "傷兵中", className: "border-down bg-down text-primary-foreground" },
};

function FocusStat({ label, value }: { label: string; value: string | number }) {
  return <div className="border-l-2 border-accent pl-3"><p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-1 font-mono text-3xl font-black leading-none">{value}</p></div>;
}

function GameStats({ card }: { card: Home["gameCards"][number] }) {
  if (card.role === "batting") {
    const line = card.line as { h: number; hr: number; rbi: number; bb: number };
    return <div className="grid grid-cols-4 gap-3"><FocusStat label="H 安打" value={line.h} /><FocusStat label="HR 全壘打" value={line.hr} /><FocusStat label="RBI 打點" value={line.rbi} /><FocusStat label="BB 保送" value={line.bb} /></div>;
  }
  const line = card.line as { ipOuts: number; h: number; er: number; so: number };
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><FocusStat label="IP 局數" value={formatInningsPitched(line.ipOuts)} /><FocusStat label="H 被安打" value={line.h} /><FocusStat label="ER 自責" value={line.er} /><FocusStat label="SO 三振" value={line.so} /></div>;
}

function GameLine({ card }: { card: Home["gameCards"][number] }) {
  if (card.role === "batting") {
    const line = card.line as { pa: number; h: number; hr: number; rbi: number; bb: number; so: number };
    return <>{line.pa} PA・{line.h} 安・{line.hr} 轟・{line.rbi} 打點・{line.bb} BB・{line.so} K</>;
  }
  const line = card.line as { ipOuts: number; h: number; r: number; er: number; so: number; bb: number };
  return <>{formatInningsPitched(line.ipOuts)}・{line.h} 安・{line.r} 失分・{line.er} 自責・{line.so} K・{line.bb} BB</>;
}

function SectionHeading({ kicker, title, id }: { kicker: string; title: string; id: string }) {
  return <div className="mb-6"><p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">{kicker}</p><h2 id={id} className="font-serif text-3xl font-black tracking-tight">{title}</h2></div>;
}

export function HomePageView({ home }: { home: Home }) {
  const focus = home.gameCards[0];
  const hasGames = Boolean(home.digestDate && home.gameCards.length > 0);
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-16">
      <header className="grid gap-6 border-b-2 border-foreground pb-10 md:grid-cols-[1.5fr_1fr] md:items-end">
        <h1 className="font-serif text-5xl font-black leading-none tracking-tight md:text-7xl">台灣球員<span className="text-accent">動態</span></h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground md:justify-self-end">追蹤台灣球員每天的賽況、異動與下一場比賽。</p>
      </header>

      {focus && hasGames && (
        <section className="mt-10 rounded-2xl bg-primary p-6 text-primary-foreground md:p-10" aria-labelledby="today-focus">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div><p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">今日焦點</p><div className="flex items-center gap-3"><LevelBadge level={focus.level} /><span className="font-mono text-xs text-primary-foreground/70">{focus.teamAbbrev ?? "—"}</span></div><h2 id="today-focus" className="mt-5 font-serif text-5xl font-black leading-none">{focus.nameZh}</h2><p className="mt-6 border-l-4 border-accent pl-4 font-serif text-xl italic leading-relaxed text-primary-foreground/90">{focus.recentForm}</p><Link href={`/players/${focus.playerId}`} className="mt-8 inline-block font-mono text-xs font-bold uppercase tracking-widest text-accent hover:underline">閱讀完整檔案 →</Link></div>
            <div><GameStats card={focus} /></div>
          </div>
        </section>
      )}

      <section className="mt-16" aria-labelledby="latest-results"><SectionHeading id="latest-results" kicker="RECENT RESULTS" title="近期賽果" />
        {hasGames ? <><p className="mb-4 font-mono text-xs text-muted-foreground">美國比賽日 {home.digestDate}</p><div className="border-t-2 border-foreground">{home.gameCards.map((card, index) => <article key={`${card.playerId}-${card.role}-${index}`} className="grid gap-3 border-b border-border py-5 sm:grid-cols-[7rem_1fr_auto] sm:items-center"><time className="font-mono text-sm font-bold tabular-nums text-muted-foreground">{home.digestDate}</time><div><Link href={`/players/${card.playerId}`} className="font-serif text-xl font-black hover:text-accent">{card.nameZh}</Link><div className="mt-2 flex flex-wrap items-center gap-2"><LevelBadge level={card.level} /><span className="font-mono text-xs text-muted-foreground">{card.teamAbbrev ?? "—"}</span></div><p className="mt-2 font-mono text-xs text-muted-foreground"><GameLine card={card} /></p></div><span className="hidden font-mono text-2xl text-accent sm:block">↗</span></article>)}</div></> : home.emptyState ? <EmptyFallback empty={home.emptyState} /> : <EmptyState title="近期無賽事" description="目前沒有可呈現的比賽資料。" />}
      </section>

      <section className="mt-16" aria-labelledby="transactions"><SectionHeading id="transactions" kicker="TRANSACTIONS" title="異動快訊" />{home.events.length > 0 ? <ul className="border-t-2 border-foreground">{home.events.map((event) => { const tone = eventTone(event.type); return <li key={`${event.playerId}-${event.date}-${event.type}`} className="grid gap-3 border-b border-border py-4 sm:grid-cols-[7rem_1fr]"><time className="font-mono text-xs font-bold tabular-nums text-muted-foreground">{event.date}</time><div><Link href={`/players/${event.playerId}`} className={`font-serif text-lg font-black ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"}`}>{event.typeLabel}・{event.nameZh}</Link>{event.description && <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>}</div></li>; })}</ul> : <EmptyState title="近期沒有球員異動" description="新的異動會在資料同步後顯示。" />}</section>

      <section className="mt-16" aria-labelledby="upcoming-games"><SectionHeading id="upcoming-games" kicker="UP NEXT" title="即將出賽" />{home.upcoming.length > 0 ? <ul className="border-t-2 border-foreground">{home.upcoming.map((entry) => { const tag = UPCOMING_TAGS[entry.tag]; return <li key={entry.playerId} className="grid gap-3 border-b border-border py-4 sm:grid-cols-[1fr_auto]"><div><Link href={`/players/${entry.playerId}`} className="font-serif text-xl font-black hover:text-accent">{entry.nameZh}</Link>{entry.tag !== "il" && <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.opponent ? `對 ${entry.opponent}` : "賽程待定"}{entry.startTimeUtc ? `・${formatDateTimeTaipei(entry.startTimeUtc)}` : ""}</p>}</div><span className={`h-fit rounded-full border px-3 py-1.5 font-mono text-xs font-bold ${tag.className}`}>{tag.label}</span></li>; })}</ul> : <EmptyState title="目前沒有即將出賽的賽程" description="有新賽程時會顯示在這裡。" />}</section>
    </main>
  );
}

function EmptyFallback({ empty }: { empty: NonNullable<Home["emptyState"]> }) {
  return <div className="space-y-10"><EmptyState title="本日沒有賽事" description="先看看本季／上季回顧，或認識一個棒球名詞。" /><div><h3 className="mb-4 font-serif text-2xl font-black">本季／上季回顧</h3><div className="border-t-2 border-foreground">{empty.seasonReviewCards.map((card) => <article key={card.playerId} className="grid gap-3 border-b border-border py-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><Link href={`/players/${card.playerId}`} className="font-serif text-xl font-black hover:text-accent">{card.nameZh}</Link><p className="mt-1 font-mono text-xs text-muted-foreground">{card.season ? `${card.season} 球季` : "尚無球季成績"}・{card.recentForm}</p></div><p className="font-mono text-sm text-muted-foreground">{card.batting ? `${card.batting.g} 場・${card.batting.h} 安・${card.batting.hr} 轟・${card.batting.rbi} 打點` : card.pitching ? `${card.pitching.g} 場・${formatInningsPitched(card.pitching.ipOuts)}・${card.pitching.so} 三振` : "—"}</p></article>)}</div></div><div><h3 className="mb-4 font-serif text-2xl font-black">棒球名詞</h3><div className="grid gap-4 sm:grid-cols-3">{empty.glossaryPicks.map((pick) => <article key={pick.link} className="rounded-xl border border-border bg-card p-5"><Link href={pick.link} className="font-serif text-lg font-black hover:text-accent">{pick.nameZh}</Link><p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{pick.nameEn}</p><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{pick.blurb}</p></article>)}</div></div></div>;
}
