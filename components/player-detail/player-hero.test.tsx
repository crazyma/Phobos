import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlayerDetail } from "@/lib/services";
import { PlayerHero } from "./player-hero.tsx";

const base: PlayerDetail = {
  playerId: 691907,
  nameEn: "Tsung-Che Cheng",
  nameZh: "鄭宗哲",
  primaryPosition: "SS",
  bats: "L",
  throws: "R",
  birthdate: "2001-07-26",
  lifecycle: "tracked",
  team: { id: 10, name: "波士頓紅襪", abbrev: "BOS", level: "mlb", levelLabel: "大聯盟" },
  statusSentence: "大聯盟",
  recentForm: "連續 5 場有安打",
  seasons: [],
  gameLog: { batting: [], pitching: [] },
  timeline: [],
  upcoming: null,
};

describe("PlayerHero", () => {
  it("renders name, bio facts, status and recent form", () => {
    const html = renderToStaticMarkup(<PlayerHero player={base} />);
    expect(html).toContain("鄭宗哲");
    expect(html).toContain("Tsung-Che Cheng");
    expect(html).toContain("SS");
    expect(html).toContain("左打・右投"); // bats/throws label
    expect(html).toContain("2001-07-26");
    expect(html).toContain("大聯盟・波士頓紅襪"); // team badge
    expect(html).toContain("連續 5 場有安打"); // recent form
  });

  it("falls back to a placeholder when recent form is missing", () => {
    const html = renderToStaticMarkup(
      <PlayerHero player={{ ...base, recentForm: null }} />,
    );
    expect(html).toContain("近況同步中");
  });

  it("omits the team badge and bio facts gracefully when absent", () => {
    const html = renderToStaticMarkup(
      <PlayerHero
        player={{
          ...base,
          team: null,
          bats: null,
          throws: null,
          birthdate: null,
          primaryPosition: null,
        }}
      />,
    );
    expect(html).toContain("鄭宗哲");
    expect(html).not.toContain("大聯盟・");
  });
});
