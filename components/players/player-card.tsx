import type { PlayerSummary } from "@/lib/services";

/**
 * One roster entry: 中英名 + 守位、目前隊伍/層級徽章、狀態一句、近況一句話。
 * No "use client" — a plain presentational component usable from both the
 * server page and the client roster view. `recentForm` null → placeholder.
 */
export function PlayerCard({ player }: { player: PlayerSummary }) {
  const displayName = player.nameZh ?? player.nameEn;

  return (
    <article className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium">{displayName}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {player.nameEn}
            {player.primaryPosition ? ` · ${player.primaryPosition}` : ""}
          </p>
        </div>
        {player.team && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {player.team.levelLabel}・{player.team.name}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm">{player.statusSentence}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {player.recentForm ?? "近況同步中"}
      </p>
    </article>
  );
}
