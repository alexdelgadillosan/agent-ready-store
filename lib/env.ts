export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get shopifyShop() {
    return requireEnv("SHOPIFY_SHOP")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
  },
  get shopifyAccessToken() {
    return process.env.SHOPIFY_ACCESS_TOKEN?.trim() || "";
  },
  get shopifyClientId() {
    return process.env.SHOPIFY_CLIENT_ID?.trim() || "";
  },
  get shopifyClientSecret() {
    return process.env.SHOPIFY_CLIENT_SECRET?.trim() || "";
  },
  get shopifyApiVersion() {
    return process.env.SHOPIFY_API_VERSION || "2026-10";
  },
  get shopifyWebhookSecret() {
    return process.env.SHOPIFY_WEBHOOK_SECRET || "";
  },
  get paypalClientId() {
    return requireEnv("PAYPAL_CLIENT_ID");
  },
  get paypalClientSecret() {
    return requireEnv("PAYPAL_CLIENT_SECRET");
  },
  get paypalEnv(): "sandbox" | "live" {
    return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  },
  get paypalWebhookId() {
    return process.env.PAYPAL_WEBHOOK_ID || "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL || "";
  },
  get llmBaseUrl() {
    return (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
  },
  get llmApiKey() {
    return requireEnv("LLM_API_KEY");
  },
  get llmModel() {
    return process.env.LLM_MODEL || "gpt-4.1-mini";
  },
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get checkoutTtlMinutes() {
    const value = Number.parseInt(process.env.CHECKOUT_TTL_MINUTES || "30", 10);
    return Number.isFinite(value) && value >= 10 && value <= 120 ? value : 30;
  },
  get mcpBearerToken() {
    return process.env.MCP_BEARER_TOKEN || "";
  },
};
