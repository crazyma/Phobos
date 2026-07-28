import type { MetadataRoute } from "next";
import { db as defaultDb } from "../db/client.ts";
import { players } from "../db/schema/index.ts";
import { loadAllFrontmatter } from "../glossary/content.ts";
import { siteUrl } from "../site.ts";

/** Build every public, indexable route (spec-02 §4). */
export async function getSitemapEntries(db = defaultDb): Promise<MetadataRoute.Sitemap> {
  const playerRows = await db
    .select({ playerId: players.mlbPlayerId, updatedAt: players.updatedAt })
    .from(players);
  const glossaryEntries = loadAllFrontmatter().map((term) => ({
    url: siteUrl(`/glossary/${term.slug}`),
  }));

  return [
    { url: siteUrl("/") },
    { url: siteUrl("/players") },
    { url: siteUrl("/glossary") },
    ...playerRows.map((player) => ({
      url: siteUrl(`/players/${player.playerId}`),
      lastModified: player.updatedAt,
    })),
    ...glossaryEntries,
  ];
}
