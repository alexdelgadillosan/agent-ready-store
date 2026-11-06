import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    accessToken: text("access_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("merchants_shop_domain_idx").on(table.shopDomain)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id").notNull(),
    shopifyProductId: text("shopify_product_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    altText: text("alt_text"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("products_merchant_shopify_idx").on(
      table.merchantId,
      table.shopifyProductId,
    ),
    index("products_title_idx").on(table.title),
  ],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id").notNull(),
    productId: uuid("product_id").notNull(),
    shopifyVariantId: text("shopify_variant_id").notNull(),
    title: text("title").notNull().default(""),
    sku: text("sku").notNull().default(""),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    stockCached: integer("stock_cached").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("variants_merchant_shopify_idx").on(
      table.merchantId,
      table.shopifyVariantId,
    ),
    index("variants_product_idx").on(table.productId),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id").notNull(),
    cartId: uuid("cart_id").notNull(),
    quantity: integer("quantity").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("reservations_variant_idx").on(table.variantId),
    index("reservations_cart_idx").on(table.cartId),
  ],
);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id").notNull(),
    status: text("status").notNull().default("open"),
    paypalOrderId: text("paypal_order_id"),
    approvalUrl: text("approval_url"),
    shopifyDraftOrderId: text("shopify_draft_order_id"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    buyerEmail: text("buyer_email"),
    buyerName: text("buyer_name"),
    items: jsonb("items").$type<CartItemRecord[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("carts_status_idx").on(table.status)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartId: uuid("cart_id").notNull(),
    paypalCaptureId: text("paypal_capture_id"),
    shopifyOrderId: text("shopify_order_id"),
    shopifyOrderName: text("shopify_order_name"),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("paid"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("orders_cart_idx").on(table.cartId)],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartId: uuid("cart_id"),
    toolName: text("tool_name").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("agent_events_created_idx").on(table.createdAt)],
);

export type CartItemRecord = {
  variantId: string;
  shopifyVariantId: string;
  quantity: number;
  priceCents: number;
};

export type Merchant = typeof merchants.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Variant = typeof variants.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type Order = typeof orders.$inferSelect;
