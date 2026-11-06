import { randomUUID } from "node:crypto";
import { and, eq, ilike, inArray, lte, or, type SQL } from "drizzle-orm";
import { db } from "./db";
import {
  agentEvents,
  carts,
  orders,
  products,
  variants,
  type CartItemRecord,
} from "./schema";
import {
  consumeReservations,
  getAvailableStock,
  releaseReservations,
  reserveItems,
} from "./reservations";
import {
  completeDraftOrder,
  createDraftOrder,
  decrementCachedStock,
  getMerchant,
} from "./shopify";
import {
  capturePayPalOrder,
  createPayPalOrder,
  getCaptureId,
} from "./paypal";

const MAX_QUANTITY_PER_VARIANT = 10;
const MAX_CART_TOTAL_CENTS = 50_000;
const RESERVATION_TTL_MINUTES = 10;

export type SearchProductsInput = {
  query: string;
  maxPriceCents?: number;
  inStockOnly?: boolean;
  limit?: number;
};

export type GetProductInput = {
  productId: string;
};

export type CreateCartInput = {
  items: Array<{ variantId: string; quantity: number }>;
  buyer: {
    email: string;
    name?: string;
    address?: {
      address1?: string;
      address2?: string;
      city?: string;
      province?: string;
      provinceCode?: string;
      country?: string;
      countryCode?: string;
      zip?: string;
      phone?: string;
    };
  };
};

export type CompleteCheckoutInput = {
  cartId: string;
  paypalOrderId?: string;
};

type ProductWithVariants = {
  product: typeof products.$inferSelect;
  variants: Array<typeof variants.$inferSelect>;
};

function serializeProduct(
  entry: ProductWithVariants,
  available: Map<string, number>,
  inStockOnly: boolean,
) {
  const serializedVariants = entry.variants
    .map((variant) => ({
      variant_id: variant.shopifyVariantId,
      title: variant.title,
      sku: variant.sku,
      price_cents: variant.priceCents,
      currency: variant.currency,
      available_stock: available.get(variant.id) ?? 0,
    }))
    .filter((variant) => !inStockOnly || variant.available_stock > 0);

  return {
    product_id: entry.product.shopifyProductId,
    title: entry.product.title,
    description: entry.product.description,
    image_url: entry.product.imageUrl,
    alt_text: entry.product.altText,
    variants: serializedVariants,
  };
}

function groupProducts(
  rows: Array<{
    product: typeof products.$inferSelect;
    variant: typeof variants.$inferSelect;
  }>,
): ProductWithVariants[] {
  const byProduct = new Map<string, ProductWithVariants>();

  for (const row of rows) {
    const entry = byProduct.get(row.product.id) ?? {
      product: row.product,
      variants: [],
    };
    entry.variants.push(row.variant);
    byProduct.set(row.product.id, entry);
  }

  return Array.from(byProduct.values());
}

export async function searchProducts(input: SearchProductsInput) {
  const merchant = await getMerchant();
  const query = input.query.trim();
  const filters: SQL[] = [eq(products.merchantId, merchant.id)];

  if (query) {
    const term = `%${query}%`;
    const textFilter = or(
      ilike(products.title, term),
      ilike(products.description, term),
    );
    if (textFilter) {
      filters.push(textFilter);
    }
  }

  if (typeof input.maxPriceCents === "number") {
    filters.push(lte(variants.priceCents, input.maxPriceCents));
  }

  const rows = await db
    .select({ product: products, variant: variants })
    .from(products)
    .innerJoin(variants, eq(variants.productId, products.id))
    .where(and(...filters))
    .limit(Math.max(1, Math.min(input.limit ?? 10, 50)) * 10);

  const grouped = groupProducts(rows);
  const variantIds = grouped.flatMap((entry) =>
    entry.variants.map((variant) => variant.id),
  );
  const available = await getAvailableStock(variantIds);
  const inStockOnly = input.inStockOnly ?? true;

  const results = grouped
    .map((entry) => serializeProduct(entry, available, inStockOnly))
    .filter((entry) => entry.variants.length > 0)
    .slice(0, Math.max(1, Math.min(input.limit ?? 10, 50)));

  return { products: results };
}

export async function getProduct(input: GetProductInput) {
  const merchant = await getMerchant();
  const isGid = input.productId.startsWith("gid://");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    input.productId,
  );

  if (!isGid && !isUuid) {
    throw new Error("productId must be a Shopify GID or a UUID");
  }

  const condition = isGid
    ? eq(products.shopifyProductId, input.productId)
    : eq(products.id, input.productId);

  const rows = await db
    .select({ product: products, variant: variants })
    .from(products)
    .innerJoin(variants, eq(variants.productId, products.id))
    .where(and(eq(products.merchantId, merchant.id), condition))
    .limit(100);

  const grouped = groupProducts(rows);
  if (grouped.length === 0) {
    return { product: null };
  }

  const available = await getAvailableStock(
    grouped.flatMap((entry) => entry.variants.map((variant) => variant.id)),
  );

  return {
    product: serializeProduct(grouped[0], available, false),
  };
}

export async function createCart(input: CreateCartInput) {
  if (!input.items?.length) {
    throw new Error("Cart must contain at least one item");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.buyer.email ?? "")) {
    throw new Error("A valid buyer email is required");
  }

  const requested = new Map<string, number>();
  for (const item of input.items) {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_QUANTITY_PER_VARIANT
    ) {
      throw new Error(
        `Quantity must be an integer between 1 and ${MAX_QUANTITY_PER_VARIANT}`,
      );
    }
    requested.set(
      item.variantId,
      (requested.get(item.variantId) ?? 0) + item.quantity,
    );
  }

  for (const [variantId, quantity] of requested) {
    if (quantity > MAX_QUANTITY_PER_VARIANT) {
      throw new Error(
        `Maximum ${MAX_QUANTITY_PER_VARIANT} units per variant (requested ${quantity} for ${variantId})`,
      );
    }
  }

  const merchant = await getMerchant();
  const shopifyVariantIds = Array.from(requested.keys());

  const rows = await db
    .select({ variant: variants, product: products })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(
      and(
        eq(variants.merchantId, merchant.id),
        inArray(variants.shopifyVariantId, shopifyVariantIds),
      ),
    );

  const byShopifyId = new Map(rows.map((row) => [row.variant.shopifyVariantId, row]));

  for (const variantId of shopifyVariantIds) {
    if (!byShopifyId.has(variantId)) {
      throw new Error(`Unknown variant: ${variantId}`);
    }
  }

  let subtotalCents = 0;
  for (const [variantId, quantity] of requested) {
    const row = byShopifyId.get(variantId);
    if (row) {
      subtotalCents += row.variant.priceCents * quantity;
    }
  }

  if (subtotalCents > MAX_CART_TOTAL_CENTS) {
    throw new Error(
      `Cart total exceeds the ${MAX_CART_TOTAL_CENTS / 100} ${rows[0]?.variant.currency ?? "USD"} limit`,
    );
  }

  const cartId = randomUUID();
  const cartItems: CartItemRecord[] = [];
  const reservationItems: Array<{ variantId: string; quantity: number }> = [];

  for (const [shopifyVariantId, quantity] of requested) {
    const row = byShopifyId.get(shopifyVariantId);
    if (!row) {
      continue;
    }
    cartItems.push({
      variantId: row.variant.id,
      shopifyVariantId,
      quantity,
      priceCents: row.variant.priceCents,
    });
    reservationItems.push({ variantId: row.variant.id, quantity });
  }

  await reserveItems(reservationItems, cartId);

  try {
    const draftOrder = await createDraftOrder(
      Array.from(requested.entries()).map(([variantId, quantity]) => ({
        variantId,
        quantity,
      })),
      input.buyer,
    );

    if (draftOrder.totalCents <= 0) {
      throw new Error("Shopify calculated a zero total");
    }

    if (draftOrder.totalCents > MAX_CART_TOTAL_CENTS) {
      throw new Error(
        `Shopify total exceeds the ${MAX_CART_TOTAL_CENTS / 100} ${draftOrder.currency} limit`,
      );
    }

    const paypal = await createPayPalOrder({
      cartId,
      amount: (draftOrder.totalCents / 100).toFixed(2),
      currency: draftOrder.currency,
    });

    const expiresAt = new Date(
      Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000,
    );

    const [cart] = await db
      .insert(carts)
      .values({
        id: cartId,
        merchantId: merchant.id,
        status: "open",
        paypalOrderId: paypal.order.id,
        approvalUrl: paypal.approvalUrl,
        shopifyDraftOrderId: draftOrder.id,
        subtotalCents: draftOrder.subtotalCents,
        shippingCents: draftOrder.shippingCents,
        taxCents: draftOrder.taxCents,
        totalCents: draftOrder.totalCents,
        currency: draftOrder.currency,
        buyerEmail: input.buyer.email,
        buyerName: input.buyer.name ?? null,
        items: cartItems,
        expiresAt,
      })
      .returning();

    if (!cart) {
      throw new Error("Could not persist cart");
    }

    return {
      cart_id: cart.id,
      status: cart.status,
      totals: {
        subtotal_cents: cart.subtotalCents,
        shipping_cents: cart.shippingCents,
        tax_cents: cart.taxCents,
        total_cents: cart.totalCents,
        currency: cart.currency,
      },
      paypal_order_id: cart.paypalOrderId,
      approval_url: cart.approvalUrl,
      expires_at: cart.expiresAt.toISOString(),
      shopify_draft_order: {
        id: draftOrder.id,
        name: draftOrder.name,
      },
    };
  } catch (error) {
    await releaseReservations(cartId);
    throw error;
  }
}

function serializeOrder(order: typeof orders.$inferSelect) {
  return {
    order_id: order.id,
    cart_id: order.cartId,
    status: order.status,
    paypal_capture_id: order.paypalCaptureId,
    shopify_order_id: order.shopifyOrderId,
    shopify_order_name: order.shopifyOrderName,
    amount_cents: order.amountCents,
    currency: order.currency,
    created_at: order.createdAt.toISOString(),
  };
}

export async function completeCheckout(input: CompleteCheckoutInput) {
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.id, input.cartId))
    .limit(1);

  if (!cart) {
    throw new Error(`Cart not found: ${input.cartId}`);
  }

  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.cartId, input.cartId))
    .limit(1);

  if (existingOrder) {
    return { order: serializeOrder(existingOrder), already_completed: true };
  }

  if (cart.expiresAt.getTime() < Date.now()) {
    await releaseReservations(cart.id);
    await db
      .update(carts)
      .set({ status: "expired" })
      .where(and(eq(carts.id, cart.id), eq(carts.status, "open")));
    throw new Error(
      "The inventory reservation expired before payment was captured. Start a new cart.",
    );
  }

  // Single finalizer: only one request can move the cart out of "open".
  const claimed = await db
    .update(carts)
    .set({ status: "processing" })
    .where(and(eq(carts.id, cart.id), eq(carts.status, "open")))
    .returning();

  if (claimed.length === 0) {
    const [orderAfterRace] = await db
      .select()
      .from(orders)
      .where(eq(orders.cartId, input.cartId))
      .limit(1);

    if (orderAfterRace) {
      return {
        order: serializeOrder(orderAfterRace),
        already_completed: true,
      };
    }

    throw new Error(
      "Checkout is already being finalized for this cart. Refresh in a moment.",
    );
  }

  const paypalOrderId = input.paypalOrderId ?? cart.paypalOrderId;
  if (!paypalOrderId) {
    await db
      .update(carts)
      .set({ status: "open" })
      .where(eq(carts.id, cart.id));
    throw new Error("Cart has no PayPal order id");
  }

  let captured = false;

  try {
    const capture = await capturePayPalOrder(paypalOrderId);
    const captureId = getCaptureId(capture);
    captured = true;

    const shopifyResult = cart.shopifyDraftOrderId
      ? await completeDraftOrder(cart.shopifyDraftOrderId)
      : { shopifyOrderId: null, shopifyOrderName: null };

    const [order] = await db
      .insert(orders)
      .values({
        cartId: cart.id,
        paypalCaptureId: captureId,
        shopifyOrderId: shopifyResult.shopifyOrderId,
        shopifyOrderName: shopifyResult.shopifyOrderName,
        amountCents: cart.totalCents,
        currency: cart.currency,
        status: "paid",
      })
      .onConflictDoNothing({ target: orders.cartId })
      .returning();

    if (!order) {
      const [existingAfterInsert] = await db
        .select()
        .from(orders)
        .where(eq(orders.cartId, cart.id))
        .limit(1);

      if (!existingAfterInsert) {
        throw new Error("Could not persist order");
      }

      return {
        order: serializeOrder(existingAfterInsert),
        already_completed: true,
      };
    }

    await db
      .update(carts)
      .set({ status: "paid" })
      .where(eq(carts.id, cart.id));

    await consumeReservations(cart.id);

    if (cart.items?.length) {
      await decrementCachedStock(
        cart.items.map((item) => ({
          shopifyVariantId: item.shopifyVariantId,
          quantity: item.quantity,
        })),
        cart.merchantId,
      );
    }

    return { order: serializeOrder(order), already_completed: false };
  } catch (error) {
    // If PayPal already captured but Shopify failed, extend the hold so a
    // retry can complete the draft order without the expiry check refusing it.
    await db
      .update(carts)
      .set({
        status: "open",
        ...(captured
          ? { expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
          : {}),
      })
      .where(and(eq(carts.id, cart.id), eq(carts.status, "processing")));
    throw error;
  }
}

export async function getCartStatus(cartId: string) {
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.id, cartId))
    .limit(1);

  if (!cart) {
    return { cart: null, order: null };
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.cartId, cartId))
    .limit(1);

  return {
    cart: {
      cart_id: cart.id,
      status: cart.status,
      approval_url: cart.approvalUrl,
      total_cents: cart.totalCents,
      currency: cart.currency,
      expires_at: cart.expiresAt.toISOString(),
      items: cart.items,
    },
    order: order ? serializeOrder(order) : null,
  };
}

export async function logAgentEvent(
  toolName: string,
  input: unknown,
  output: unknown,
  cartId?: string | null,
) {
  try {
    await db.insert(agentEvents).values({
      toolName,
      input,
      output,
      cartId: cartId ?? null,
    });
  } catch {
    // Telemetry must never break a purchase.
  }
}

export async function getDashboardData() {
  const merchant = await getMerchant();

  const orderRows = await db
    .select()
    .from(orders)
    .orderBy(orders.createdAt)
    .limit(200);

  const recentOrders = orderRows
    .slice()
    .reverse()
    .map((order) => ({
      id: order.id,
      shopify_order_name: order.shopifyOrderName,
      amount: order.amountCents / 100,
      currency: order.currency,
      status: order.status,
      created_at: order.createdAt.toISOString(),
      paypal_capture_id: order.paypalCaptureId,
    }));

  const stockRows = await db
    .select({
      product: products.title,
      variant: variants.title,
      sku: variants.sku,
      stock: variants.stockCached,
      price: variants.priceCents,
      currency: variants.currency,
      variantId: variants.id,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.merchantId, merchant.id))
    .limit(500);

  const available = await getAvailableStock(
    stockRows.map((row) => row.variantId),
  );

  const inventory = stockRows.map((row) => ({
    product: row.product,
    variant: row.variant,
    sku: row.sku,
    price: row.price / 100,
    currency: row.currency,
    stock: available.get(row.variantId) ?? 0,
  }));

  const events = await db
    .select()
    .from(agentEvents)
    .orderBy(agentEvents.createdAt)
    .limit(100);

  const recentEvents = events
    .slice()
    .reverse()
    .map((event) => ({
      id: event.id,
      tool: event.toolName,
      created_at: event.createdAt.toISOString(),
    }));

  const revenue = recentOrders.reduce(
    (total, order) => total + (order.status === "paid" ? order.amount : 0),
    0,
  );

  return {
    revenue,
    orderCount: recentOrders.length,
    productCount: new Set(inventory.map((row) => row.product)).size,
    orders: recentOrders,
    inventory,
    events: recentEvents,
  };
}
