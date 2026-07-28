import type { PlayerDetail } from "@/lib/services";
import { batsThrowsLabel } from "@/lib/services/player-status";

/** Birthdate "YYYY-MM-DD" → "YYYY-MM-DD（xx 歲）", or the date alone if unparseable. */
function birthLabel(birthdate: string | null): string | null {
  if (!birthdate) return null;
  // Parse the Y/M/D components directly — `new Date("YYYY-MM-DD")` is UTC
  // midnight, which off-by-ones the age around the birthday on non-UTC servers.
  const parts = birthdate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return birthdate;
  const [by, bm, bd] = parts;
  const now = new Date();
  let age = now.getFullYear() - by;
  const m = now.getMonth() + 1 - bm;
  if (m < 0 || (m === 0 && now.getDate() < bd)) age--;
  return `${birthdate}（${age} 歲）`;
}

/**
 * Zone 1 (spec-02 §2.3): bio, the status one-liner, and the recent-form
 * sentence. Presentational (no "use client") — the server page passes data in.
 */
export function PlayerHero({ player }: { player: PlayerDetail }) {
  const displayName = player.nameZh ?? player.nameEn;
  const hand = batsThrowsLabel(player.bats, player.throws);
  const born = birthLabel(player.birthdate);

  const facts = [
    player.primaryPosition,
    hand,
    born,
  ].filter((v): v is string => Boolean(v));

  return (
    <header className="border-b border-border pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{player.nameEn}</p>
        </div>
        {player.team && (
          <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-sm text-muted-foreground">
            {player.team.levelLabel}・{player.team.name}
          </span>
        )}
      </div>

      {facts.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{facts.join("　·　")}</p>
      )}

      <p className="mt-4 text-base font-medium">{player.statusSentence}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {player.recentForm ?? "近況同步中"}
      </p>
    </header>
  );
}
