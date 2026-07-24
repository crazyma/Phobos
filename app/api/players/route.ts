import { NextResponse } from "next/server";
import { getPlayerSummaries } from "@/lib/services";

/**
 * GET /api/players → PlayerSummary[] (spec-02 §4).
 * Thin handler: all shaping lives in `lib/services` so the page and the API
 * share one code path. Reads DB directly (Node runtime).
 */
export async function GET() {
  const summaries = await getPlayerSummaries();
  return NextResponse.json(summaries);
}
