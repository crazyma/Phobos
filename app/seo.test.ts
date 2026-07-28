import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db/client";
import { playerCurrentStatus, playerRecentForm, players, teams } from "@/lib/db/schema";
import sitemap from "./sitemap.ts";
import robots from "./robots.ts";
import { generateMetadata as generatePlayerMetadata } from "./players/[id]/page.tsx";
import { generateMetadata as generateGlossaryMetadata } from "./glossary/[slug]/page.tsx";
import { siteOpenGraph } from "@/lib/seo/open-graph";

const TRACKED_ID = 905001;
const ARCHIVED_ID = 905002;
const PLAYER_IDS = [TRACKED_ID, ARCHIVED_ID];
const TEAM_ID = 995001;

async function cleanup() {
  await db.delete(playerRecentForm).where(inArray(playerRecentForm.playerId, PLAYER_IDS));
  await db.delete(playerCurrentStatus).where(inArray(playerCurrentStatus.playerId, PLAYER_IDS));
  await db.delete(players).where(inArray(players.mlbPlayerId, PLAYER_IDS));
  await db.delete(teams).where(inArray(teams.mlbTeamId, [TEAM_ID]));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();
  await db.insert(teams).values({ mlbTeamId: TEAM_ID, nameEn: "SEO Team", nameZh: "搜尋隊", level: "mlb" });
  await db.insert(players).values([
    { mlbPlayerId: TRACKED_ID, nameEn: "SEO Tracked", nameZh: "SEO 追蹤", lifecycle: "tracked" },
    { mlbPlayerId: ARCHIVED_ID, nameEn: "SEO Archived", nameZh: "SEO 封存", lifecycle: "archived" },
  ]);
  await db.insert(playerCurrentStatus).values({
    playerId: TRACKED_ID, affiliation: "rostered", teamId: TEAM_ID, level: "mlb", health: "active",
  });
  await db.insert(playerRecentForm).values({
    playerId: TRACKED_ID, sentenceZh: "近 5 場打擊率 .400", pattern: "recent_agg",
  });
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("SEO metadata routes", () => {
  it("includes static pages, every player including archived, and glossary terms in sitemap.xml", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/$/),
      expect.stringMatching(/\/players$/),
      expect.stringMatching(/\/glossary$/),
      expect.stringMatching(new RegExp(`/players/${TRACKED_ID}$`)),
      expect.stringMatching(new RegExp(`/players/${ARCHIVED_ID}$`)),
      expect.stringMatching(/\/glossary\/wrc-plus$/),
    ]));
    expect(urls.every((url) => url.startsWith("https://"))).toBe(true);
  });

  it("allows all crawlers and advertises the absolute sitemap URL", () => {
    const result = robots();

    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toMatch(/^https:\/\/.*\/sitemap\.xml$/);
  });

  it("builds player share metadata from the current team, recent form, and MLB logo", async () => {
    const metadata = await generatePlayerMetadata({
      params: Promise.resolve({ id: String(TRACKED_ID) }),
    });
    const openGraph = metadata.openGraph as { title?: string; description?: string; images?: string[] };

    expect(openGraph.title).toContain("SEO 追蹤");
    expect(openGraph.title).toContain("搜尋隊");
    expect(openGraph.description).toBe("近 5 場打擊率 .400");
    expect(openGraph.images).toContain(`https://www.mlbstatic.com/team-logos/${TEAM_ID}.svg`);
  });

  it("falls back to the site image when a player has no team", async () => {
    const metadata = await generatePlayerMetadata({
      params: Promise.resolve({ id: String(ARCHIVED_ID) }),
    });
    const openGraph = metadata.openGraph as { images?: string[] };

    expect(openGraph.images?.[0]).toMatch(/^https:\/\/.*\/og-default\.png$/);
  });

  it("uses a glossary term's blurb for its share description and exposes a site default", async () => {
    const glossaryMetadata = await generateGlossaryMetadata({
      params: Promise.resolve({ slug: "wrc-plus" }),
    });
    const glossaryOpenGraph = glossaryMetadata.openGraph as { description?: string };

    expect(glossaryOpenGraph.description).toContain("聯盟平均");
    expect(siteOpenGraph.images[0]).toMatch(/^https:\/\/.*\/og-default\.png$/);
  });
});
