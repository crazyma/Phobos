import { describe, expect, it } from "vitest";
import { checkDbConnection } from "./health.ts";

describe("db connection", () => {
  it("connects to Postgres and runs a trivial query", async () => {
    const result = await checkDbConnection();
    expect(result.ok).toBe(true);
    expect(result.one).toBe(1);
  });
});
