import { describe, expect, it } from "vitest";
import { bandLabel } from "./bands.ts";
import type { Band } from "./schema.ts";

const bands: Band[] = [
  { max: 80, label: "低於平均" },
  { max: 100, label: "及格" },
  { max: 125, label: "不錯" },
  { label: "MVP 等級" },
];

describe("bandLabel", () => {
  it("picks the first band the value doesn't exceed", () => {
    expect(bandLabel(bands, 70)).toBe("低於平均");
    expect(bandLabel(bands, 80)).toBe("低於平均"); // inclusive max
    expect(bandLabel(bands, 95)).toBe("及格");
    expect(bandLabel(bands, 120)).toBe("不錯");
  });

  it("falls into the open-ended last band above every max", () => {
    expect(bandLabel(bands, 160)).toBe("MVP 等級");
  });
});
