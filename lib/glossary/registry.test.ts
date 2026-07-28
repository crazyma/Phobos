import { describe, expect, it } from "vitest";
import { assertMetricsCovered, buildRegistry } from "./registry.ts";
import type { Frontmatter } from "./schema.ts";

const term = (slug: string, metric_keys: string[]): Frontmatter =>
  ({ slug, metric_keys } as Frontmatter);

describe("buildRegistry", () => {
  it("maps every metric_key to its term slug", () => {
    const registry = buildRegistry([
      term("wrc-plus", ["wrc_plus"]),
      term("bb-pct", ["bb_pct"]),
    ]);
    expect(registry.get("wrc_plus")).toBe("wrc-plus");
    expect(registry.get("bb_pct")).toBe("bb-pct");
  });

  it("throws when one metric_key maps to two different slugs", () => {
    expect(() =>
      buildRegistry([term("a", ["war"]), term("b", ["war"])]),
    ).toThrow(/war/);
  });
});

describe("assertMetricsCovered (spec-04 §D build-fail)", () => {
  it("passes when every required key has a page", () => {
    const registry = buildRegistry([term("fip", ["fip"]), term("war", ["war"])]);
    expect(() => assertMetricsCovered(registry, ["fip", "war"])).not.toThrow();
  });

  it("throws listing the metric whose page is missing", () => {
    const registry = buildRegistry([term("fip", ["fip"])]);
    expect(() => assertMetricsCovered(registry, ["fip", "war"])).toThrow(/war/);
  });
});
