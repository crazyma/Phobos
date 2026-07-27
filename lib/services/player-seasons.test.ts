import { describe, expect, it } from "vitest";
import { buildSeasons } from "./player-seasons.ts";
import type { BattingCounting, PitchingCounting } from "./stats.ts";

const bat = (o: Partial<BattingCounting>): BattingCounting => ({
  g: 0, pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, r: 0,
  sb: 0, cs: 0, bb: 0, so: 0, hbp: 0, sf: 0, ...o,
});
const pit = (o: Partial<PitchingCounting>): PitchingCounting => ({
  g: 0, gs: 0, ipOuts: 0, bf: 0, h: 0, r: 0, er: 0, hr: 0, bb: 0, so: 0,
  w: 0, l: 0, sv: 0, hld: 0, ...o,
});
const team = (id: number, abbrev: string) => ({ id, name: `Team ${id}`, abbrev });

describe("buildSeasons", () => {
  it("orders seasons descending and sections by level", () => {
    const seasons = buildSeasons(
      [
        { season: 2023, level: "a", team: team(1, "AAA"), ...bat({ ab: 10, h: 3 }) },
        { season: 2024, level: "mlb", team: team(2, "NYY"), ...bat({ ab: 20, h: 6 }) },
      ],
      [],
    );
    expect(seasons.map((s) => s.season)).toEqual([2024, 2023]);
    expect(seasons[0].batting[0].level).toBe("mlb");
    expect(seasons[1].batting[0].isLowLevel).toBe(true); // "a" is low
  });

  it("recomputes the level total from summed counting when >1 team", () => {
    const [season] = buildSeasons(
      [
        { season: 2024, level: "aaa", team: team(1, "A"), ...bat({ ab: 40, h: 20 }) }, // .500
        { season: 2024, level: "aaa", team: team(2, "B"), ...bat({ ab: 60, h: 12 }) }, // .200
      ],
      [],
    );
    const aaa = season.batting[0];
    expect(aaa.rows).toHaveLength(2);
    expect(aaa.total).not.toBeNull();
    expect(aaa.total!.ab).toBe(100);
    // recomputed .320 (32/100), NOT the average of .500 and .200
    expect(aaa.total!.avg).toBeCloseTo(0.32, 6);
    expect(aaa.total!.team).toBeNull(); // total row has no team
  });

  it("omits the total when a level has a single team", () => {
    const [season] = buildSeasons(
      [{ season: 2024, level: "mlb", team: team(1, "NYY"), ...bat({ ab: 10, h: 3 }) }],
      [],
    );
    expect(season.batting[0].total).toBeNull();
  });

  it("groups pitching independently and recomputes ERA on the total", () => {
    const [season] = buildSeasons(
      [],
      [
        { season: 2024, level: "mlb", team: team(1, "A"), ...pit({ ipOuts: 90, er: 5 }) },
        { season: 2024, level: "mlb", team: team(2, "B"), ...pit({ ipOuts: 90, er: 15 }) },
      ],
    );
    expect(season.pitching[0].total!.era).toBeCloseTo(3.0, 6); // 20 ER / 60 IP
  });

  it("returns an empty array when there are no season rows", () => {
    expect(buildSeasons([], [])).toEqual([]);
  });
});
