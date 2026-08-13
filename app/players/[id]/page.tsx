import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlayerDetail } from "@/lib/services";
import { PlayerHero } from "@/components/player-detail/player-hero";
import { SeasonStats } from "@/components/player-detail/season-stats";
import { GameLog } from "@/components/player-detail/game-log";
import { Timeline } from "@/components/player-detail/timeline";
import { Upcoming } from "@/components/player-detail/upcoming";
import { playerShareMetadata } from "@/lib/seo/open-graph";
import { MediaCarousel } from "@/components/player-detail/media-carousel";
import { PLAYER_MEDIA_MOCK } from "@/lib/services/media.mock";

// ISR: data refreshes twice a day (spec-03); a 30-min revalidate suffices
// (spec-02 §2.3). On-demand revalidation on ETL completion is a v2 open item.
export const revalidate = 1800;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const playerId = parseId(id);
  if (playerId === null) return { title: "找不到球員 — Phobos" };
  const player = await getPlayerDetail(playerId);
  if (!player) return { title: "找不到球員 — Phobos" };
  const name = player.nameZh ?? player.nameEn;
  const share = playerShareMetadata(player);
  return {
    title: `${name}（${player.nameEn}）— Phobos`,
    description: `${name} 的大聯盟表現與動態：${player.statusSentence}。`,
    openGraph: share.openGraph,
    twitter: share.twitter,
  };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = parseId(id);
  if (playerId === null) notFound();

  const player = await getPlayerDetail(playerId);
  if (!player) notFound();

  const isArchived = player.lifecycle === "archived";

  return (
    <article className="mx-auto min-w-0 max-w-6xl overflow-x-hidden px-6 py-10 pb-16">
      <PlayerHero player={player} />

      {isArchived && (
        <div className="mt-8 border border-dashed border-border bg-muted p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted-foreground">ARCHIVED PROFILE</p>
          <p className="mt-2 font-serif text-lg font-black">已離開美職體系</p>
          <p className="mt-1 text-sm text-muted-foreground">以下僅保留生涯總成績。</p>
        </div>
      )}

      <SeasonStats
        seasons={player.seasons}
        heading={isArchived ? "生涯總成績" : "球季數據"}
        currentTeamId={player.team?.id ?? null}
      />

      {/* zones 3–5 hidden for archived players (spec-02 §2.3) */}
      {!isArchived && (
        <>
          <GameLog gameLog={player.gameLog} />
          <MediaCarousel items={PLAYER_MEDIA_MOCK[player.playerId] ?? []} />
          <Timeline timeline={player.timeline} />
          <Upcoming upcoming={player.upcoming} />
        </>
      )}
    </article>
  );
}
