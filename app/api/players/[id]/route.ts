import { NextResponse } from "next/server";
import { getPlayerDetail } from "@/lib/services";

/**
 * GET /api/players/:id → PlayerDetail (spec-02 §3).
 * Thin handler over `lib/services` (same code path as the page). Non-whitelist
 * id → 404; unexpected failure → 500 `{ error }`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: "player not found" }, { status: 404 });
  }

  try {
    const player = await getPlayerDetail(playerId);
    if (!player) {
      return NextResponse.json({ error: "player not found" }, { status: 404 });
    }
    return NextResponse.json(player);
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
