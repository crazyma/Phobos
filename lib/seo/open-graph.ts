import type { PlayerDetail } from "../services/player-detail.ts";
import { siteUrl } from "../site.ts";

const SITE_NAME = "Phobos — 台灣球員大聯盟";
const SITE_DESCRIPTION = "記錄台灣球員在大聯盟（及 3A/2A）的表現與動態。";

export const DEFAULT_OG_IMAGE = siteUrl("/og-default.png");

export const siteOpenGraph = {
  type: "website" as const,
  url: siteUrl("/"),
  siteName: SITE_NAME,
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  images: [DEFAULT_OG_IMAGE],
};

export const siteTwitter = {
  card: "summary_large_image" as const,
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  images: [DEFAULT_OG_IMAGE],
};

/** MLB's static logo endpoint is stable and requires no image proxying in v1. */
export function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

export function playerShareMetadata(player: PlayerDetail) {
  const name = player.nameZh ?? player.nameEn;
  const title = player.team
    ? `${name}｜${player.team.name} — Phobos`
    : `${name} — Phobos`;
  const description = player.recentForm ?? player.statusSentence;
  const image = player.team ? teamLogoUrl(player.team.id) : DEFAULT_OG_IMAGE;
  return {
    openGraph: {
      type: "website" as const,
      url: siteUrl(`/players/${player.playerId}`),
      siteName: SITE_NAME,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [image],
    },
  };
}

export function glossaryShareMetadata(term: {
  slug: string;
  name_zh: string;
  name_en: string;
  blurb: string;
}) {
  const title = `${term.name_zh}（${term.name_en}）— Phobos`;
  return {
    openGraph: {
      type: "article" as const,
      url: siteUrl(`/glossary/${term.slug}`),
      siteName: SITE_NAME,
      title,
      description: term.blurb,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description: term.blurb,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}
