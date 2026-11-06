import { NextResponse } from "next/server";
import { z } from "zod";
import { completeCheckout } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  cart_id: z.string().uuid(),
  paypal_order_id: z.string().optional(),
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid checkout payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await completeCheckout({
      cartId: parsed.data.cart_id,
      paypalOrderId: parsed.data.paypal_order_id,
    });
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
