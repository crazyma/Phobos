import { describe, expect, it } from "vitest";
import { buildStatusSentence, levelLabel } from "./player-status.ts";

describe("levelLabel", () => {
  it("maps each team level to its zh display", () => {
    expect(levelLabel("mlb")).toBe("大聯盟");
    expect(levelLabel("aaa")).toBe("3A");
    expect(levelLabel("aa")).toBe("2A");
    expect(levelLabel("a_plus")).toBe("高階1A");
    expect(levelLabel("a")).toBe("1A");
    expect(levelLabel("rookie")).toBe("新人聯盟");
  });

  it("returns null for a missing level", () => {
    expect(levelLabel(null)).toBeNull();
  });
});

describe("buildStatusSentence (歸屬 × 健康, spec-01 B.2)", () => {
  it("rostered + active shows just the level", () => {
    expect(
      buildStatusSentence({ affiliation: "rostered", health: "active", ilDetail: null, level: "mlb" }),
    ).toBe("大聯盟");
    expect(
      buildStatusSentence({ affiliation: "rostered", health: "active", ilDetail: null, level: "aaa" }),
    ).toBe("3A");
  });

  it("rostered + IL appends the IL detail (spec-02 example)", () => {
    expect(
      buildStatusSentence({ affiliation: "rostered", health: "il", ilDetail: "il_60", level: "aaa" }),
    ).toBe("3A・傷兵名單（IL-60）");
    expect(
      buildStatusSentence({ affiliation: "rostered", health: "il", ilDetail: "il_10", level: "mlb" }),
    ).toBe("大聯盟・傷兵名單（IL-10）");
  });

  it("IL without a detail falls back to plain IL", () => {
    expect(
      buildStatusSentence({ affiliation: "rostered", health: "il", ilDetail: null, level: "mlb" }),
    ).toBe("大聯盟・傷兵名單（IL）");
  });

  it("dfa can also carry an IL health", () => {
    expect(
      buildStatusSentence({ affiliation: "dfa", health: "active", ilDetail: null, level: "mlb" }),
    ).toBe("指定讓渡（DFA）");
    expect(
      buildStatusSentence({ affiliation: "dfa", health: "il", ilDetail: "il_15", level: "mlb" }),
    ).toBe("指定讓渡（DFA）・傷兵名單（IL-15）");
  });

  it("free agent / released / departed are single phrases", () => {
    expect(
      buildStatusSentence({ affiliation: "free_agent", health: "active", ilDetail: null, level: null }),
    ).toBe("自由球員");
    expect(
      buildStatusSentence({ affiliation: "released", health: "active", ilDetail: null, level: null }),
    ).toBe("已遭釋出");
    expect(
      buildStatusSentence({ affiliation: "departed", health: "active", ilDetail: null, level: null }),
    ).toBe("已離開美職");
  });

  it("falls back when there is no projected status yet (empty state)", () => {
    expect(
      buildStatusSentence({ affiliation: null, health: null, ilDetail: null, level: null }),
    ).toBe("狀態同步中");
  });
});
