import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  completeCheckout,
  createCart,
  getCartStatus,
  getProduct,
  logAgentEvent,
  searchProducts,
} from "./tools";
import { isChannel3Configured, searchExternalProducts } from "./channel3";

const addressSchema = z.object({
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  province: z
    .string()
    .optional()
    .describe("Two-letter state/province code, e.g. CA or ON"),
  provinceCode: z.string().optional(),
  country: z
    .string()
    .optional()
    .describe("ISO 3166-1 alpha-2 country code, e.g. US, CA, GB"),
  countryCode: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
});

function toText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * Registers every Agent-Ready Store tool on an MCP server.
 *
 * These are the same functions the built-in chat agent calls, so an external
 * MCP client (Claude, ChatGPT connectors, a custom agent) and the demo agent
 * always see identical behaviour and identical real data.
 */
export function registerAgentReadyTools(server: McpServer) {
  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search the connected Shopify store catalog. Returns real products with variant IDs, prices in cents, currency, image URLs and live available stock (Shopify stock minus active reservations).",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Free-text search over product title and description")
          .default(""),
        max_price_cents: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Only return variants at or below this price in cents"),
        in_stock_only: z
          .boolean()
          .default(true)
          .describe("Hide variants with zero available stock"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum number of products to return"),
      }),
    },
    async (input) => {
      try {
        const output = await searchProducts({
          query: input.query,
          maxPriceCents: input.max_price_cents,
          inStockOnly: input.in_stock_only,
          limit: input.limit,
        });
        await logAgentEvent("search_products", input, output);
        return { content: [{ type: "text", text: toText(output) }] };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product",
      description:
        "Get one Shopify product with all variants, prices, stock and image. Accepts a Shopify product GID or the cached product UUID.",
      inputSchema: z.object({
        product_id: z
          .string()
          .describe("Shopify product GID (gid://shopify/Product/...) or product UUID"),
      }),
    },
    async (input) => {
      try {
        const output = await getProduct({ productId: input.product_id });
        await logAgentEvent("get_product", input, output);
        return { content: [{ type: "text", text: toText(output) }] };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "create_cart",
    {
      title: "Create cart and PayPal order",
      description:
        "Reserve inventory atomically, create a real Shopify Draft Order, calculate real shipping/tax totals, and create a real PayPal Orders v2 order. Returns the PayPal approval URL the buyer must open.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              variant_id: z
                .string()
                .describe("Shopify ProductVariant GID returned by search_products"),
              quantity: z.number().int().min(1).max(10),
            }),
          )
          .min(1),
        buyer: z.object({
          email: z.string().email(),
          name: z.string().optional(),
          address: addressSchema.optional(),
        }),
      }),
    },
    async (input) => {
      let cartId: string | null = null;
      try {
        const output = await createCart({
          items: input.items.map((item) => ({
            variantId: item.variant_id,
            quantity: item.quantity,
          })),
          buyer: input.buyer,
        });
        cartId = output.cart_id;
        await logAgentEvent("create_cart", input, output, cartId);
        return { content: [{ type: "text", text: toText(output) }] };
      } catch (error) {
        await logAgentEvent("create_cart", input, {
          error: error instanceof Error ? error.message : String(error),
        });
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_cart_status",
    {
      title: "Get cart status",
      description:
        "Read a cart, its totals, reservation expiry and the resulting order (if paid).",
      inputSchema: z.object({
        cart_id: z.string().uuid(),
      }),
    },
    async (input) => {
      try {
        const output = await getCartStatus(input.cart_id);
        await logAgentEvent("get_cart_status", input, output, input.cart_id);
        return { content: [{ type: "text", text: toText(output) }] };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "complete_checkout",
    {
      title: "Capture PayPal payment and complete Shopify order",
      description:
        "Capture an approved PayPal order (idempotent), complete the Shopify Draft Order with paymentPending=false, persist the order and consume the inventory reservation. Only call after the buyer has approved the payment in PayPal.",
      inputSchema: z.object({
        cart_id: z.string().uuid(),
        paypal_order_id: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        const output = await completeCheckout({
          cartId: input.cart_id,
          paypalOrderId: input.paypal_order_id,
        });
        await logAgentEvent(
          "complete_checkout",
          input,
          output,
          input.cart_id,
        );
        return { content: [{ type: "text", text: toText(output) }] };
      } catch (error) {
        await logAgentEvent("complete_checkout", input, {
          error: error instanceof Error ? error.message : String(error),
        });
        return errorResult(error);
      }
    },
  );

  // Optional, real Channel3 discovery. Registered only when a key is present,
  // so an unconfigured deployment never advertises a tool it cannot run.
  if (isChannel3Configured()) {
    server.registerTool(
      "search_external_products",
      {
        title: "Search external products (Channel3)",
        description:
          "Search Channel3's real product graph for products that are NOT in this Shopify store. Returns external retailer offers with prices and buy links. These items cannot be added to a cart here; use this only when the merchant's own catalog has no match, and label the results as external.",
        inputSchema: z.object({
          query: z.string().min(1).describe("What the buyer is looking for"),
          max_price_cents: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Only return offers at or below this price in cents"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(30)
            .default(8)
            .describe("Maximum number of products to return"),
        }),
      },
      async (input) => {
        try {
          const output = await searchExternalProducts({
            query: input.query,
            maxPriceCents: input.max_price_cents,
            limit: input.limit,
          });
          await logAgentEvent("search_external_products", input, output);
          return { content: [{ type: "text", text: toText(output) }] };
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  }
}
