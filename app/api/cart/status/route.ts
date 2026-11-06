import { NextResponse } from "next/server";
import { getCartStatus } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const cartId = new URL(request.url).searchParams.get("cart_id");

  if (!cartId || !UUID_PATTERN.test(cartId)) {
    return NextResponse.json(
      { error: "cart_id must be a valid UUID" },
      { status: 400 },
    );
  }

  try {
    const result = await getCartStatus(cartId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
