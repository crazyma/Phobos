import Link from "next/link";
import type { PlayerSummary } from "@/lib/services";
import { MAGAZINE_CARD_HOVER } from "@/components/magazine/card-styles";

/**
 * One roster entry: 中英名 + 守位、目前隊伍/層級徽章、狀態一句、近況一句話.
 * The whole card links to the player's page `/players/[id]` (spec-02 §2.3).
 * No "use client" — a plain presentational component usable from both the
 * server page and the client roster view. `recentForm` null → placeholder.
 */
export function PlayerCard({ player, index }: { player: PlayerSummary; index: number }) {
  const displayName = player.nameZh ?? player.nameEn;

  return (
    <Link
      href={`/players/${player.playerId}`}
      className={`group relative block overflow-hidden rounded-sm border border-border bg-card p-5 text-card-foreground ${MAGAZINE_CARD_HOVER}`}
    >
      <span className="pointer-events-none absolute right-3 top-1 font-serif text-4xl font-black leading-none text-foreground/[0.06]">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="relative min-w-0">
        <div className="mb-3 h-0.5 w-8 bg-accent" />
        <h3 className="font-serif text-xl font-black leading-tight text-foreground">{displayName}</h3>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {player.nameEn}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {[player.primaryPosition, player.team?.name].filter(Boolean).join(" ・ ") || "隊伍同步中"}
        </p>
      </div>
      <p className="mt-4 border-l-4 border-accent pl-3 font-serif text-sm font-bold text-foreground">
        {player.statusSentence}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {player.recentForm ?? "近況同步中"}
      </p>
    </Link>
  );
}
