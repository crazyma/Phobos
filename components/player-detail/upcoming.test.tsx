import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Upcoming as UpcomingType } from "@/lib/services";
import { Upcoming } from "./upcoming.tsx";

const upcoming: NonNullable<UpcomingType> = {
  tag: "probable_starter",
  nextGame: {
    gamePk: 1, gameDate: "2026-07-30", startTimeUtc: "2026-07-30T23:05:00.000Z",
    isHome: false, opponent: { abbrev: "RIV", name: "對手" }, venueName: "Rival Park",
    seriesGameNumber: 2, gamesInSeries: 3,
  },
  recentResults: [
    { gamePk: 2, gameDate: "2026-07-28", isHome: true, opponent: { abbrev: "RIV", name: "對手" }, teamScore: 5, opponentScore: 3, win: true },
  ],
};

describe("Upcoming", () => {
  it("renders the tag, next series and recent results", () => {
    const html = renderToStaticMarkup(<Upcoming upcoming={upcoming} />);
    expect(html).toContain("確定先發");
    expect(html).toContain("RIV");
    expect(html).toContain("第 2/3 戰");
    expect(html).toContain("勝");
    expect(html).toContain("5-3");
  });

  it("shows a no-team state when upcoming is null", () => {
    expect(renderToStaticMarkup(<Upcoming upcoming={null} />)).toContain("目前無所屬球隊");
  });

  it("labels an injured player 傷兵中", () => {
    const html = renderToStaticMarkup(
      <Upcoming upcoming={{ tag: "il", nextGame: null, recentResults: [] }} />,
    );
    expect(html).toContain("傷兵中");
  });
});
