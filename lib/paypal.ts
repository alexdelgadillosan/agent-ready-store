import { env } from "./env";

const PAYPAL_BASE =
  env.paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const auth = Buffer.from(
    `${env.paypalClientId}:${env.paypalClientSecret}`,
  ).toString("base64");

  const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };

  if (!response.ok || !json.access_token) {
    throw new Error(
      `PayPal auth failed: ${json.error_description ?? response.status}`,
    );
  }

  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 300) * 1000,
  };

  return cachedToken.token;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links: Array<{ href: string; rel: string; method?: string }>;
}

export async function createPayPalOrder(params: {
  cartId: string;
  amount: string;
  currency: string;
}): Promise<{ order: PayPalOrder; approvalUrl: string }> {
  const token = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `cart-${params.cartId}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.cartId,
          description: "OmniBuy AI verified purchase",
          amount: {
            currency_code: params.currency,
            value: params.amount,
          },
        },
      ],
      application_context: {
          brand_name: "OmniBuy AI",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: `${env.appUrl}/checkout/return?cart_id=${params.cartId}`,
        cancel_url: `${env.appUrl}/checkout/return?cart_id=${params.cartId}&cancelled=1`,
      },
    }),
    cache: "no-store",
  });

  const json = (await response.json()) as PayPalOrder & {
    message?: string;
    details?: unknown;
  };

  if (!response.ok) {
    throw new Error(
      `PayPal create order failed: ${json.message ?? response.status}`,
    );
  }

  const approvalUrl = json.links?.find((link) => link.rel === "approve")?.href;

  if (!approvalUrl) {
    throw new Error("PayPal did not return an approval URL");
  }

  return { order: json, approvalUrl };
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount?: { currency_code: string; value: string };
      }>;
    };
  }>;
}

export async function getPayPalOrder(
  paypalOrderId: string,
): Promise<PayPalCapture> {
  const token = await getAccessToken();

  const response = await fetch(
    `${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  const json = (await response.json()) as PayPalCapture & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      `PayPal get order failed: ${json.message ?? response.status}`,
    );
  }

  return json;
}

type PayPalErrorResponse = {
  message?: string;
  details?: Array<{ issue?: string }>;
};

export async function capturePayPalOrder(
  paypalOrderId: string,
): Promise<PayPalCapture> {
  const token = await getAccessToken();

  const response = await fetch(
    `${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `capture-${paypalOrderId}`,
      },
      body: "{}",
      cache: "no-store",
    },
  );

  const json = (await response.json()) as PayPalErrorResponse & {
    id?: string;
    status?: string;
  };

  if (!response.ok) {
    // A previous attempt may have captured the order but lost the response
    // (timeout, crash, redeploy). Recover the existing capture instead of
    // charging twice or leaving the buyer paid with no order.
    const alreadyCaptured = json.details?.some(
      (detail) => detail.issue === "ORDER_ALREADY_CAPTURED",
    );

    if (alreadyCaptured) {
      const existing = await getPayPalOrder(paypalOrderId);
      if (existing.status === "COMPLETED") {
        return existing;
      }
    }

    throw new Error(
      `PayPal capture failed: ${json.message ?? response.status}`,
    );
  }

  const capture = json as PayPalCapture;

  if (capture.status !== "COMPLETED") {
    throw new Error(`PayPal capture status is ${capture.status}`);
  }

  return capture;
}

export function getCaptureId(capture: PayPalCapture): string | null {
  return capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
}

export async function verifyPayPalWebhook(
  headers: Headers,
  event: unknown,
): Promise<boolean> {
  if (!env.paypalWebhookId) {
    return false;
  }

  const token = await getAccessToken();

  const response = await fetch(
    `${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: env.paypalWebhookId,
        webhook_event: event,
      }),
      cache: "no-store",
    },
  );

  const json = (await response.json()) as {
    verification_status?: string;
  };

  return json.verification_status === "SUCCESS";
}
