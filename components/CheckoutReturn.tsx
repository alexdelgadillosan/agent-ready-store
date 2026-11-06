"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Order = {
  order_id: string;
  status: string;
  paypal_capture_id: string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  amount_cents: number;
  currency: string;
  created_at: string;
};

type State =
  | { status: "working" }
  | { status: "cancelled" }
  | { status: "error"; message: string }
  | { status: "done"; order: Order; alreadyCompleted: boolean };

export default function CheckoutReturn() {
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [state, setState] = useState<State>({ status: "working" });

  const cartId = searchParams.get("cart_id");
  const cancelled = searchParams.get("cancelled") === "1";
  const paypalOrderId = searchParams.get("token") ?? undefined;

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    if (cancelled) {
      setState({ status: "cancelled" });
      return;
    }

    if (!cartId) {
      setState({
        status: "error",
        message: "This return URL has no cart_id.",
      });
      return;
    }

    async function finalize() {
      try {
        const response = await fetch("/api/checkout/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cart_id: cartId,
            paypal_order_id: paypalOrderId,
          }),
        });

        const json = (await response.json()) as {
          order?: Order;
          already_completed?: boolean;
          error?: string;
        };

        if (!response.ok || !json.order) {
          throw new Error(
            json.error ?? `Checkout finalization failed (${response.status})`,
          );
        }

        setState({
          status: "done",
          order: json.order,
          alreadyCompleted: json.already_completed ?? false,
        });
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    void finalize();
  }, [cartId, cancelled, paypalOrderId]);

  return (
    <div className="shell page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>Checkout</h1>
        <p>
          This page captures the approved PayPal order and completes the Shopify
          Draft Order. It runs once per cart.
        </p>
      </div>

      {state.status === "working" ? (
        <div className="card">
          <span className="status-line">
            <span className="dot dot-amber" />
            Capturing PayPal payment and completing the Shopify order…
          </span>
        </div>
      ) : null}

      {state.status === "cancelled" ? (
        <div className="notice-box">
          You cancelled the PayPal approval. The inventory reservation will be
          released automatically when it expires. You can start a new cart from
          the buyer agent.
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="stack">
          <div className="error-box">{state.message}</div>
          <div className="actions">
            <Link href="/chat" className="btn btn-ghost">
              Back to the buyer agent
            </Link>
            {cartId ? (
              <Link
                href={`/api/cart/status?cart_id=${cartId}`}
                className="btn btn-ghost btn-sm"
                target="_blank"
              >
                Inspect cart JSON
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.status === "done" ? (
        <div className="stack">
          <div className="success-box">
            Payment captured. The Shopify order is live in the store admin.
            {state.alreadyCompleted
              ? " This cart had already been finalized; showing the existing order."
              : ""}
          </div>
          <div className="card">
            <h3>Order details</h3>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Shopify order</dt>
              <dd>{state.order.shopify_order_name ?? "—"}</dd>
              <dt>Shopify order ID</dt>
              <dd>{state.order.shopify_order_id ?? "—"}</dd>
              <dt>PayPal capture</dt>
              <dd>{state.order.paypal_capture_id ?? "—"}</dd>
              <dt>Amount</dt>
              <dd>
                {state.order.currency}{" "}
                {(state.order.amount_cents / 100).toFixed(2)}
              </dd>
              <dt>Status</dt>
              <dd>{state.order.status}</dd>
              <dt>Internal order</dt>
              <dd>{state.order.order_id}</dd>
            </dl>
          </div>
          <div className="actions">
            <Link href="/dashboard" className="btn btn-primary">
              See it on the dashboard →
            </Link>
            <Link href="/chat" className="btn btn-ghost">
              Buy something else
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
