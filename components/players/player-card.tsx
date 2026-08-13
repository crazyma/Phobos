import Link from "next/link";
import type { PlayerSummary } from "@/lib/services";
import {
  MAGAZINE_ARCHIVED_CARD_HOVER,
  MAGAZINE_CARD_HOVER,
} from "@/components/magazine/card-styles";
import { teamLogo } from "@/lib/services/team-map";

/**
 * One roster entry: 中英名 + 守位、目前隊伍/層級徽章、狀態一句、近況一句話.
 * The whole card links to the player's page `/players/[id]` (spec-02 §2.3).
 * No "use client" — a plain presentational component usable from both the
 * server page and the client roster view. `recentForm` null → placeholder.
 *
 * `archived`：呼叫端只表達「這張是封存球員」的語意，封存長什麼樣由本元件決定。
 * 做法是「壓底色 + 去掉橘色重點」而不是降透明度——整張卡片是可點的 `<a>`，
 * 不適用 WCAG「非作用中元件」豁免，而整體透明度會把 text-muted-foreground
 * 壓到 AA 以下（實測：不降 5.99:1、透明度 0.75 只剩 3.47:1、0.6 約 2.6:1）。
 * 改壓 bg-muted 後次要小字回到 5.04:1，仍過 AA 4.5:1。
 * 註：註解裡刻意不寫出 Tailwind 的透明度 class 全名——Tailwind 會掃描本檔，
 * 寫全就會把用不到的 utility 當成候選字編回 CSS bundle。
 */
export function PlayerCard({
  player,
  index,
  archived = false,
}: {
  player: PlayerSummary;
  index: number;
  archived?: boolean;
}) {
  const displayName = player.nameZh ?? player.nameEn;
  const surface = archived ? "bg-muted" : "bg-card";
  /** 封存卡片整張去彩度：橘色重點換成與次要文字同色的灰。 */
  const rule = archived ? "bg-muted-foreground" : "bg-accent";
  const quoteRule = archived ? "border-muted-foreground" : "border-accent";
  const hover = archived ? MAGAZINE_ARCHIVED_CARD_HOVER : MAGAZINE_CARD_HOVER;
  const logo = teamLogo(player.team?.id);

  return (
    <Link
      href={`/players/${player.playerId}`}
      className={`group relative block overflow-hidden rounded-sm border border-border ${surface} p-5 text-card-foreground ${hover}`}
    >
      <span className="pointer-events-none absolute right-3 top-1 font-serif text-4xl font-black leading-none text-foreground/[0.06]">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="relative min-w-0">
        <div className={`mb-3 h-0.5 w-8 ${rule}`} />
        <h3 className="font-serif text-xl font-black leading-tight text-foreground">{displayName}</h3>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {player.nameEn}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {player.primaryPosition && <span>{player.primaryPosition}</span>}
          {player.primaryPosition && player.team?.name && <span aria-hidden="true">・</span>}
          {player.team?.name && <span>{player.team.name}</span>}
          {!player.primaryPosition && !player.team?.name && "隊伍同步中"}
          {logo && <img src={logo} alt="" className="size-5 object-contain" />}
        </p>
      </div>
      <p className={`mt-4 border-l-4 ${quoteRule} pl-3 font-serif text-sm font-bold text-foreground`}>
        {player.statusSentence}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {player.recentForm ?? "近況同步中"}
      </p>
    </Link>
  );
}
