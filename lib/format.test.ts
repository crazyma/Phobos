import { describe, expect, it } from "vitest";
import {
  DASH,
  formatDateTimeTaipei,
  formatEra,
  formatInningsPitched,
  formatPct,
  formatRate3,
} from "./format.ts";

describe("formatInningsPitched (ip_outs → 「x.y 局」)", () => {
  it("renders full innings with zero remainder", () => {
    expect(formatInningsPitched(0)).toBe("0.0 局");
    expect(formatInningsPitched(3)).toBe("1.0 局");
    expect(formatInningsPitched(21)).toBe("7.0 局");
  });

  it("renders leftover outs as the fractional part (0/1/2)", () => {
    expect(formatInningsPitched(1)).toBe("0.1 局");
    expect(formatInningsPitched(2)).toBe("0.2 局");
    expect(formatInningsPitched(17)).toBe("5.2 局"); // 5 innings + 2 outs
    expect(formatInningsPitched(20)).toBe("6.2 局");
  });

  it("returns a dash for nullish / invalid input", () => {
    expect(formatInningsPitched(null)).toBe(DASH);
    expect(formatInningsPitched(undefined)).toBe(DASH);
    expect(formatInningsPitched(Number.NaN)).toBe(DASH);
  });
});

describe("formatRate3 (AVG/OBP/SLG/OPS, 三位小數, 棒球慣例去前導零)", () => {
  it("drops the leading zero for sub-1 values", () => {
    expect(formatRate3(0.2732)).toBe(".273");
    expect(formatRate3(0.3)).toBe(".300");
    expect(formatRate3(0)).toBe(".000");
  });

  it("keeps the integer digit when value >= 1 (e.g. OPS)", () => {
    expect(formatRate3(1)).toBe("1.000");
    expect(formatRate3(1.052)).toBe("1.052");
  });

  it("returns a dash for nullish input", () => {
    expect(formatRate3(null)).toBe(DASH);
    expect(formatRate3(undefined)).toBe(DASH);
  });
});

describe("formatEra (ERA/FIP, 兩位小數)", () => {
  it("formats to two decimals keeping the leading digit", () => {
    expect(formatEra(3.14)).toBe("3.14");
    expect(formatEra(0)).toBe("0.00");
    expect(formatEra(12.5)).toBe("12.50");
    expect(formatEra(2.666)).toBe("2.67");
  });

  it("returns a dash for nullish input", () => {
    expect(formatEra(null)).toBe(DASH);
  });
});

describe("formatPct (fraction → 一位小數 百分比)", () => {
  it("multiplies a fraction by 100 with one decimal", () => {
    expect(formatPct(0.235)).toBe("23.5%");
    expect(formatPct(0.72)).toBe("72.0%");
    expect(formatPct(0)).toBe("0.0%");
  });

  it("returns a dash for nullish input", () => {
    expect(formatPct(null)).toBe(DASH);
  });
});

describe("formatDateTimeTaipei (UTC → Asia/Taipei, YYYY-MM-DD HH:mm)", () => {
  it("shifts a UTC instant into Taipei time (+8)", () => {
    expect(formatDateTimeTaipei("2026-07-24T06:30:00Z")).toBe("2026-07-24 14:30");
    // crosses the date boundary
    expect(formatDateTimeTaipei("2026-07-23T17:00:00Z")).toBe("2026-07-24 01:00");
  });

  it("accepts a Date instance", () => {
    expect(formatDateTimeTaipei(new Date("2026-01-01T00:00:00Z"))).toBe(
      "2026-01-01 08:00",
    );
  });

  it("returns a dash for nullish / invalid input", () => {
    expect(formatDateTimeTaipei(null)).toBe(DASH);
    expect(formatDateTimeTaipei("not-a-date")).toBe(DASH);
  });
});
