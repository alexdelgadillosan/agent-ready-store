import { NextResponse } from "next/server";
import { commitCatalogImport, validateCatalogInput, type CatalogImportFormat } from "@/lib/catalog-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mode?: string; format?: CatalogImportFormat; data?: unknown; payload?: unknown };
    const mode = body.mode ?? "preview";
    if (mode !== "preview" && mode !== "commit") return NextResponse.json({ ok: false, error: "mode must be preview or commit" }, { status: 400 });
    if (body.format && body.format !== "json" && body.format !== "csv") return NextResponse.json({ ok: false, error: "format must be json or csv" }, { status: 400 });
    const input = body.data ?? body.payload;
    if (input === undefined) return NextResponse.json({ ok: false, error: "data is required" }, { status: 400 });
    const result = validateCatalogInput(input, body.format);
    const response: Record<string, unknown> = { ok: true, mode, format: result.format, fixture: result.fixture, productCount: result.productCount, variantCount: result.variantCount, products: result.products, warnings: result.warnings };
    if (mode === "commit") response.importId = await commitCatalogImport(result, input);
    return NextResponse.json(response, { status: mode === "commit" ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
