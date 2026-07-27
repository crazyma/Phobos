import { describe, expect, it } from "vitest";
import {
  deriveBatting,
  derivePitching,
  sumBatting,
  sumPitching,
  type BattingCounting,
  type PitchingCounting,
} from "./stats.ts";

const bat = (o: Partial<BattingCounting>): BattingCounting => ({
  g: 0, pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, r: 0,
  sb: 0, cs: 0, bb: 0, so: 0, hbp: 0, sf: 0, ...o,
});

const pit = (o: Partial<PitchingCounting>): PitchingCounting => ({
  g: 0, gs: 0, ipOuts: 0, bf: 0, h: 0, r: 0, er: 0, hr: 0, bb: 0, so: 0,
  w: 0, l: 0, sv: 0, hld: 0, ...o,
});

describe("deriveBatting", () => {
  it("matches hand-computed rates", () => {
    // 30-for-100 with 10 2B, 1 3B, 5 HR, 10 BB, 2 HBP, 1 SF, 25 K, 113 PA.
    const r = deriveBatting(
      bat({ pa: 113, ab: 100, h: 30, doubles: 10, triples: 1, hr: 5, bb: 10, hbp: 2, sf: 1, so: 25 }),
    );
    expect(r.avg).toBeCloseTo(0.3, 6); // 30/100
    expect(r.slg).toBeCloseTo(0.57, 6); // TB 57 / 100
    expect(r.obp).toBeCloseTo(42 / 113, 6);
    expect(r.ops).toBeCloseTo(42 / 113 + 0.57, 6);
    expect(r.iso).toBeCloseTo(0.27, 6); // .570 - .300
    expect(r.bbPct).toBeCloseTo(10 / 113, 6);
    expect(r.kPct).toBeCloseTo(25 / 113, 6);
    expect(r.babip).toBeCloseTo(25 / 71, 6); // (30-5)/(100-25-5+1)
  });

  it("returns null rates when denominators are zero (no at-bats)", () => {
    const r = deriveBatting(bat({}));
    expect(r.avg).toBeNull();
    expect(r.obp).toBeNull();
    expect(r.ops).toBeNull();
    expect(r.babip).toBeNull();
  });
});

describe("derivePitching", () => {
  it("matches hand-computed rates", () => {
    // 60 IP (180 outs), 20 ER, 50 H, 15 BB, 5 HR, 60 K, 240 BF.
    const r = derivePitching(
      pit({ ipOuts: 180, er: 20, h: 50, bb: 15, hr: 5, so: 60, bf: 240 }),
    );
    expect(r.era).toBeCloseTo(3.0, 6); // 20*9/60
    expect(r.whip).toBeCloseTo(65 / 60, 6); // (50+15)/60
    expect(r.hr9).toBeCloseTo(0.75, 6);
    expect(r.k9).toBeCloseTo(9.0, 6);
    expect(r.bb9).toBeCloseTo(2.25, 6);
    expect(r.kPct).toBeCloseTo(0.25, 6);
    expect(r.bbPct).toBeCloseTo(0.0625, 6);
  });

  it("returns null rates with no outs recorded", () => {
    const r = derivePitching(pit({ er: 3 }));
    expect(r.era).toBeNull();
    expect(r.whip).toBeNull();
    expect(r.k9).toBeNull();
  });
});

describe("level totals recompute from summed counting", () => {
  it("sums batting rows and derives rates on the total (not by averaging)", () => {
    const teamA = bat({ pa: 50, ab: 40, h: 20, so: 5 }); // .500
    const teamB = bat({ pa: 60, ab: 60, h: 12, so: 20 }); // .200
    const total = sumBatting([teamA, teamB]);
    expect(total.ab).toBe(100);
    expect(total.h).toBe(32);
    // .320 from 32/100, NOT the (.500+.200)/2 = .350 you'd get by averaging.
    expect(deriveBatting(total).avg).toBeCloseTo(0.32, 6);
  });

  it("sums pitching rows and recomputes ERA on the total", () => {
    const total = sumPitching([
      pit({ ipOuts: 90, er: 5 }),
      pit({ ipOuts: 90, er: 15 }),
    ]);
    expect(total.ipOuts).toBe(180);
    expect(derivePitching(total).era).toBeCloseTo(3.0, 6); // 20 ER / 60 IP
  });
});
