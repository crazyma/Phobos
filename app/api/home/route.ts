import { NextResponse } from "next/server";
import { getHome } from "@/lib/services";

/** GET /api/home — homepage's single Zod-validated public data contract. */
export async function GET() {
  try {
    return NextResponse.json(await getHome());
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
