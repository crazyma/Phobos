import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameLog as GameLogType, Timeline as TimelineType } from "@/lib/services";
import { GameLog } from "./game-log.tsx";
import { Timeline } from "./timeline.tsx";

const gameLog: GameLogType = {
  batting: [
    {
      gamePk: 1, gameDate: "2026-07-22", level: "mlb", levelLabel: "大聯盟",
      isHome: false, opponent: { abbrev: "NYY", name: "洋基" },
      ab: 4, h: 2, doubles: 1, triples: 0, hr: 1, rbi: 3, r: 2, bb: 0, so: 1, sb: 0, ops: 1.5,
    },
  ],
  pitching: [
    {
      gamePk: 1, gameDate: "2026-07-22", level: "mlb", levelLabel: "大聯盟",
      isHome: false, opponent: { abbrev: "NYY", name: "洋基" },
      started: true, ipOuts: 18, h: 4, r: 2, er: 2, bb: 1, so: 7, hr: 1, era: 3.0, whip: 0.83,
    },
  ],
};

const timeline: TimelineType = [
  { date: "2026-07-23", type: "send_down", typeLabel: "下放小聯盟", description: "Optioned to Triple-A" },
];

describe("GameLog", () => {
  it("shows both batting and pitching tables for a two-way player", () => {
    const html = renderToStaticMarkup(<GameLog gameLog={gameLog} />);
    expect(html).toContain("近期比賽紀錄");
    expect(html).toContain("打擊");
    expect(html).toContain("投球");
    expect(html).toContain("@ NYY"); // away game
    expect(html).toContain("OPS");
  });

  it("shows an empty state when there are no games", () => {
    const html = renderToStaticMarkup(
      <GameLog gameLog={{ batting: [], pitching: [] }} />,
    );
    expect(html).toContain("尚無逐場成績");
  });
});

describe("Timeline", () => {
  it("renders entries with date, badge, description", () => {
    const html = renderToStaticMarkup(<Timeline timeline={timeline} />);
    expect(html).toContain("動態時間軸");
    expect(html).toContain("2026-07-23");
    expect(html).toContain("下放小聯盟");
    expect(html).toContain("Optioned to Triple-A");
    expect(html).toContain('text-down');
  });

  it("shows an empty state when there are no events", () => {
    expect(renderToStaticMarkup(<Timeline timeline={[]} />)).toContain("尚無異動紀錄");
  });
});
