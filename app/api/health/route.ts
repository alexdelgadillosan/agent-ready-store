import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    shopify: Boolean(
      process.env.SHOPIFY_SHOP?.trim() &&
      (process.env.SHOPIFY_ACCESS_TOKEN?.trim() ||
        (process.env.SHOPIFY_CLIENT_ID?.trim() && process.env.SHOPIFY_CLIENT_SECRET?.trim())),
    ),
    paypal: Boolean(
      process.env.PAYPAL_CLIENT_ID?.trim() &&
        process.env.PAYPAL_CLIENT_SECRET?.trim(),
    ),
    llm: Boolean(process.env.LLM_API_KEY?.trim()),
    database: false,
  };

  let databaseError: string | null = null;

  try {
    await pool.query("select 1");
    checks.database = true;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(
    {
      ok: checks.database && checks.shopify && checks.paypal && checks.llm,
      checks,
      databaseError,
      timestamp: new Date().toISOString(),
    },
    { status: checks.database ? 200 : 503 },
  );
}
