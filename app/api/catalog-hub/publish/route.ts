import { NextResponse } from "next/server";
import { publishCatalog } from "@/lib/catalog-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mode?: string; sourceId?: string };
    if (body.mode !== "dry-run" && body.mode !== "commit") {
      return NextResponse.json({ ok: false, error: "mode must be dry-run or commit" }, { status: 400 });
    }
    if (body.mode === "commit" && process.env.NODE_ENV === "production" && process.env.CATALOG_PUBLISH_ENABLED !== "true") {
      return NextResponse.json({ ok: false, error: "Catalog publishing is disabled in production; set CATALOG_PUBLISH_ENABLED=true after review" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, ...(await publishCatalog({ dryRun: body.mode === "dry-run", sourceId: body.sourceId })) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
