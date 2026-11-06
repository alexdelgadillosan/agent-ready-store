import { NextResponse } from "next/server";
import { expireStaleReservations } from "@/lib/reservations";
import { syncCatalog } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    await expireStaleReservations();
    const result = await syncCatalog();

    return NextResponse.json({
      ok: true,
      synced: result,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
