import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPayPalWebhook } from "@/lib/paypal";
import { carts } from "@/lib/schema";
import { completeCheckout } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
  };
};

export async function POST(request: Request) {
  let event: PayPalWebhookEvent;

  try {
    event = (await request.json()) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const verified = await verifyPayPalWebhook(request.headers, event);
  if (!verified) {
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  if (event.event_type !== "CHECKOUT.ORDER.APPROVED") {
    return NextResponse.json({ ok: true, ignored: event.event_type ?? null });
  }

  const paypalOrderId = event.resource?.id;
  if (!paypalOrderId) {
    return NextResponse.json(
      { error: "Webhook has no order id" },
      { status: 400 },
    );
  }

  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.paypalOrderId, paypalOrderId))
    .limit(1);

  if (!cart) {
    return NextResponse.json(
      { error: "No cart for this PayPal order" },
      { status: 404 },
    );
  }

  try {
    const result = await completeCheckout({
      cartId: cart.id,
      paypalOrderId,
    });

    return NextResponse.json({
      ok: true,
      order: result.order,
      already_completed: result.already_completed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
