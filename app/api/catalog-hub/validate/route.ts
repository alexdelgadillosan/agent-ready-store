import { NextResponse } from "next/server";
import { validateCatalogInput, type CatalogImportFormat } from "@/lib/catalog-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { format?: CatalogImportFormat; data?: unknown; payload?: unknown };
    const input = body.data ?? body.payload;
    if (input === undefined) return NextResponse.json({ ok: false, error: "data is required" }, { status: 400 });
    const result = validateCatalogInput(input, body.format);
    return NextResponse.json({ ok: true, mode: "preview", format: result.format, fixture: result.fixture, productCount: result.productCount, variantCount: result.variantCount, products: result.products, warnings: result.warnings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
