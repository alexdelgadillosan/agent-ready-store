import { env } from "./env";
import {
  completeCheckout,
  createCart,
  getCartStatus,
  getProduct,
  logAgentEvent,
  searchProducts,
} from "./tools";

export type AgentTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AgentStep = {
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
};

export type AgentCart = {
  cart_id: string;
  approval_url: string;
  total_cents: number;
  currency: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: AssistantMessage;
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

const MAX_STEPS = 8;

function systemPrompt(): string {
  return `You are the buyer agent for Agent-Ready Store, an agentic commerce layer for a real Shopify store.

Your job: help a human buyer find real products in the connected Shopify catalog, build a cart, and start a real PayPal order. You never invent products, prices, stock, variant IDs, discounts or delivery promises. Everything you state about the catalog must come from a tool result.

Rules:
1. Call search_products before recommending anything. Use get_product when the buyer asks for more detail about a specific product.
2. Only use variant IDs returned by the tools. Never construct or guess a GID.
3. Before create_cart you must have the buyer's email and a shipping address (name, address1, city, province/state code, postal code, and a two-letter ISO country code such as US). Ask for anything missing. Do not guess.
4. Prices and totals from tools are in cents. Present money as e.g. $12.50 USD.
5. After create_cart succeeds, give the buyer the PayPal approval URL and tell them to open it, approve the payment, and return to this page. The page finalizes the capture and the Shopify order automatically.
6. Do not call complete_checkout on your own. Only call it if the buyer explicitly says they already approved the payment and asks you to finalize, or if they ask for the status and the order is still pending.
7. Use get_cart_status when the buyer asks about an existing cart or order.
8. If a tool returns an error, explain it plainly and offer a next step. Never hide an error.
9. Keep answers short and concrete. No marketing fluff.

The store is ${env.shopifyShop}. Today is ${new Date().toISOString().slice(0, 10)}.`;
}

const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "search_products",
      description:
        "Search the real Shopify catalog. Returns products, variant IDs, prices in cents, currency, images and live available stock.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search query" },
          max_price_cents: {
            type: "integer",
            description: "Maximum price per variant in cents",
          },
          in_stock_only: {
            type: "boolean",
            description: "Hide variants with no available stock",
            default: true,
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            default: 10,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_product",
      description:
        "Get a single product with all variants, prices, stock and image by Shopify product GID or product UUID.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
        },
        required: ["product_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_cart",
      description:
        "Reserve real inventory, create a Shopify Draft Order, calculate real totals, and create a PayPal Orders v2 order. Returns a PayPal approval URL.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                variant_id: { type: "string" },
                quantity: { type: "integer", minimum: 1, maximum: 10 },
              },
              required: ["variant_id", "quantity"],
              additionalProperties: false,
            },
          },
          buyer: {
            type: "object",
            properties: {
              email: { type: "string" },
              name: { type: "string" },
              address: {
                type: "object",
                properties: {
                  address1: { type: "string" },
                  address2: { type: "string" },
                  city: { type: "string" },
                  province: {
                    type: "string",
                    description:
                      "Two-letter state/province code, e.g. CA or ON",
                  },
                  provinceCode: { type: "string" },
                  country: {
                    type: "string",
                    description:
                      "ISO 3166-1 alpha-2 country code, e.g. US, CA, GB",
                  },
                  countryCode: { type: "string" },
                  zip: { type: "string" },
                  phone: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            required: ["email"],
            additionalProperties: false,
          },
        },
        required: ["items", "buyer"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_cart_status",
      description: "Read cart totals, expiry and the resulting order if paid.",
      parameters: {
        type: "object",
        properties: { cart_id: { type: "string" } },
        required: ["cart_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "complete_checkout",
      description:
        "Capture an approved PayPal payment, complete the Shopify Draft Order, and persist the real order. Only use after the buyer approved the payment.",
      parameters: {
        type: "object",
        properties: {
          cart_id: { type: "string" },
          paypal_order_id: { type: "string" },
        },
        required: ["cart_id"],
        additionalProperties: false,
      },
    },
  },
];

async function callModel(
  messages: ChatMessage[],
): Promise<AssistantMessage> {
  const response = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.llmApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.llmModel,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 1024,
    }),
    cache: "no-store",
  });

  const json = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    throw new Error(
      `LLM request failed (${response.status}): ${
        json.error?.message ?? "unknown error"
      }`,
    );
  }

  const message = json.choices?.[0]?.message;
  if (!message) {
    throw new Error("LLM returned no message");
  }

  return message;
}

type ToolExecution = {
  ok: boolean;
  output: unknown;
};

async function executeTool(
  name: string,
  rawArguments: string,
): Promise<ToolExecution> {
  let input: Record<string, unknown>;

  try {
    input = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, output: { error: "Tool arguments were not valid JSON" } };
  }

  try {
    switch (name) {
      case "search_products": {
        const output = await searchProducts({
          query: typeof input.query === "string" ? input.query : "",
          maxPriceCents:
            typeof input.max_price_cents === "number"
              ? input.max_price_cents
              : undefined,
          inStockOnly:
            typeof input.in_stock_only === "boolean"
              ? input.in_stock_only
              : true,
          limit: typeof input.limit === "number" ? input.limit : 10,
        });
        await logAgentEvent(name, input, output);
        return { ok: true, output };
      }
      case "get_product": {
        const output = await getProduct({
          productId: String(input.product_id ?? ""),
        });
        await logAgentEvent(name, input, output);
        return { ok: true, output };
      }
      case "create_cart": {
        const items = Array.isArray(input.items)
          ? (input.items as Array<Record<string, unknown>>).map((item) => ({
              variantId: String(item.variant_id ?? ""),
              quantity: Number(item.quantity ?? 0),
            }))
          : [];
        const buyerInput = (input.buyer ?? {}) as Record<string, unknown>;
        const output = await createCart({
          items,
          buyer: {
            email: String(buyerInput.email ?? ""),
            name:
              typeof buyerInput.name === "string" ? buyerInput.name : undefined,
            address:
              buyerInput.address && typeof buyerInput.address === "object"
                ? (buyerInput.address as Record<string, string>)
                : undefined,
          },
        });
        await logAgentEvent(name, input, output, output.cart_id);
        return { ok: true, output };
      }
      case "get_cart_status": {
        const output = await getCartStatus(String(input.cart_id ?? ""));
        await logAgentEvent(name, input, output, String(input.cart_id ?? ""));
        return { ok: true, output };
      }
      case "complete_checkout": {
        const output = await completeCheckout({
          cartId: String(input.cart_id ?? ""),
          paypalOrderId:
            typeof input.paypal_order_id === "string"
              ? input.paypal_order_id
              : undefined,
        });
        await logAgentEvent(name, input, output, String(input.cart_id ?? ""));
        return { ok: true, output };
      }
      default:
        return { ok: false, output: { error: `Unknown tool: ${name}` } };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAgentEvent(name, input, { error: message });
    return { ok: false, output: { error: message } };
  }
}

export async function runAgent(history: AgentTurn[]): Promise<{
  reply: string;
  steps: AgentStep[];
  cart: AgentCart | null;
}> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    ...history.slice(-20).map<ChatMessage>((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, 4000),
    })),
  ];

  const steps: AgentStep[] = [];
  let cart: AgentCart | null = null;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const message = await callModel(messages);
    const toolCalls = message.tool_calls ?? [];

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    });

    if (toolCalls.length === 0) {
      return { reply: message.content ?? "", steps, cart };
    }

    for (const call of toolCalls) {
      const result = await executeTool(
        call.function.name,
        call.function.arguments,
      );

      if (
        call.function.name === "create_cart" &&
        result.ok &&
        result.output &&
        typeof result.output === "object"
      ) {
        const output = result.output as Record<string, unknown>;
        if (
          typeof output.cart_id === "string" &&
          typeof output.approval_url === "string" &&
          typeof output.total_cents === "number" &&
          typeof output.currency === "string"
        ) {
          cart = {
            cart_id: output.cart_id,
            approval_url: output.approval_url,
            total_cents: output.total_cents,
            currency: output.currency,
          };
        }
      }

      steps.push({
        tool: call.function.name,
        input: safeParse(call.function.arguments),
        output: result.output,
        ok: result.ok,
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result.output),
      });
    }
  }

  return {
    reply:
      "I stopped after several tool calls without finishing. Please rephrase the request, or check the store configuration.",
    steps,
    cart,
  };
}

function safeParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
}
