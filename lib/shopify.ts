import { and, eq, notInArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { merchants, products, variants, type Merchant } from "./schema";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

let clientCredentialsToken: { value: string; expiresAt: number } | null = null;

async function getShopifyAccessToken(): Promise<string> {
  if (env.shopifyAccessToken) return env.shopifyAccessToken;
  if (!env.shopifyClientId || !env.shopifyClientSecret) {
    throw new Error("Set SHOPIFY_ACCESS_TOKEN or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET");
  }
  if (clientCredentialsToken && clientCredentialsToken.expiresAt > Date.now() + 60_000) {
    return clientCredentialsToken.value;
  }

  const response = await fetch(`https://${env.shopifyShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.shopifyClientId,
      client_secret: env.shopifyClientSecret,
    }),
    cache: "no-store",
  });
  const json = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(`Shopify token error: ${json.error ?? response.status}`);
  }
  clientCredentialsToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 86400) * 1000,
  };
  return json.access_token;
}

async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${env.shopifyShop}/admin/api/${env.shopifyApiVersion}/graphql.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await getShopifyAccessToken(),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const json = (await response.json()) as GraphQLResponse<T>;

  if (!response.ok || json.errors?.length) {
    throw new Error(
      `Shopify GraphQL error: ${
        json.errors?.map((error) => error.message).join("; ") ??
        response.status
      }`,
    );
  }

  if (!json.data) {
    throw new Error("Shopify returned no data");
  }

  return json.data;
}

interface MoneySet {
  shopMoney: { amount: string; currencyCode: string };
}

interface CatalogData {
  shop: { currencyCode: string };
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      title: string;
      descriptionHtml: string | null;
      featuredImage: { url: string; altText: string | null } | null;
      variants: {
        nodes: Array<{
          id: string;
          title: string;
          sku: string | null;
          price: string;
          inventoryQuantity: number | null;
        }>;
      };
    }>;
  };
}

const CATALOG_QUERY = /* GraphQL */ `
  query Catalog($cursor: String) {
    shop {
      currencyCode
    }
    products(first: 100, after: $cursor, query: "status:active") {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        descriptionHtml
        featuredImage {
          url
          altText
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
          }
        }
      }
    }
  }
`;

export async function getMerchant(): Promise<Merchant> {
  const shopDomain = env.shopifyShop;
  const accessToken = await getShopifyAccessToken();
  const [existing] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.shopDomain, shopDomain))
    .limit(1);

  if (existing) {
    if (existing.accessToken !== accessToken) {
      await db
        .update(merchants)
        .set({ accessToken })
        .where(eq(merchants.id, existing.id));
      return { ...existing, accessToken };
    }
    return existing;
  }

  const [created] = await db
    .insert(merchants)
    .values({ shopDomain, accessToken })
    .returning();

  if (!created) {
    throw new Error("Could not create merchant row");
  }

  return created;
}

export async function syncCatalog(): Promise<{
  products: number;
  variants: number;
}> {
  const merchant = await getMerchant();
  let cursor: string | null = null;
  let productCount = 0;
  let variantCount = 0;
  const syncedProductIds: string[] = [];
  const syncedVariantIds: string[] = [];

  do {
    const data: CatalogData = await shopifyGraphQL<CatalogData>(
      CATALOG_QUERY,
      { cursor },
    );
    const currency = data.shop.currencyCode;

    for (const node of data.products.nodes) {
      const description = (node.descriptionHtml ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const [product] = await db
        .insert(products)
        .values({
          merchantId: merchant.id,
          shopifyProductId: node.id,
          title: node.title,
          description,
          imageUrl: node.featuredImage?.url ?? null,
          altText: node.featuredImage?.altText ?? null,
        })
        .onConflictDoUpdate({
          target: [products.merchantId, products.shopifyProductId],
          set: {
            title: node.title,
            description,
            imageUrl: node.featuredImage?.url ?? null,
            altText: node.featuredImage?.altText ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!product) {
        continue;
      }

      productCount += 1;
      syncedProductIds.push(product.id);

      for (const variant of node.variants.nodes) {
        await db
          .insert(variants)
          .values({
            merchantId: merchant.id,
            productId: product.id,
            shopifyVariantId: variant.id,
            title: variant.title,
            sku: variant.sku ?? "",
            priceCents: Math.round(Number.parseFloat(variant.price) * 100),
            currency,
            stockCached: variant.inventoryQuantity ?? 0,
          })
          .onConflictDoUpdate({
            target: [variants.merchantId, variants.shopifyVariantId],
            set: {
              productId: product.id,
              title: variant.title,
              sku: variant.sku ?? "",
              priceCents: Math.round(Number.parseFloat(variant.price) * 100),
              currency,
              stockCached: variant.inventoryQuantity ?? 0,
              updatedAt: new Date(),
            },
          });

        variantCount += 1;
        syncedVariantIds.push(variant.id);
      }
    }

    cursor = data.products.pageInfo.hasNextPage
      ? data.products.pageInfo.endCursor
      : null;
  } while (cursor);

  // Remove stale cache rows, but never delete a variant that still has an
  // active reservation. Products are removed only after their variants are gone.
  if (syncedVariantIds.length > 0) {
    await db
      .delete(variants)
      .where(
        and(
          eq(variants.merchantId, merchant.id),
          notInArray(variants.shopifyVariantId, syncedVariantIds),
          sql`not exists (
            select 1 from reservations r
            where r.variant_id = ${variants.id} and r.status = 'active'
          )`,
        ),
      );
  }

  if (syncedProductIds.length > 0) {
    await db
      .delete(products)
      .where(
        and(
          eq(products.merchantId, merchant.id),
          notInArray(products.shopifyProductId, syncedProductIds),
          sql`not exists (
            select 1 from variants v where v.product_id = ${products.id}
          )`,
        ),
      );
  }

  return { products: productCount, variants: variantCount };
}

export type DraftOrderLineItem = {
  variantId: string;
  quantity: number;
};

export type DraftOrderBuyer = {
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

interface DraftOrderCreateData {
  draftOrderCreate: {
    draftOrder: {
      id: string;
      name: string;
      subtotalPriceSet: MoneySet;
      totalTaxSet: MoneySet;
      totalShippingPriceSet: MoneySet;
      totalPriceSet: MoneySet;
    } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const DRAFT_ORDER_CREATE = /* GraphQL */ `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface DraftOrderCompleteData {
  draftOrderComplete: {
    draftOrder: {
      id: string;
      name: string;
    } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const DRAFT_ORDER_COMPLETE = /* GraphQL */ `
  mutation DraftOrderComplete($id: ID!, $paymentPending: Boolean) {
    draftOrderComplete(id: $id, paymentPending: $paymentPending) {
      draftOrder {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function assertNoUserErrors(
  errors: Array<{ field: string[] | null; message: string }>,
  context: string,
) {
  if (errors.length > 0) {
    throw new Error(
      `${context}: ${errors.map((error) => error.message).join("; ")}`,
    );
  }
}

function toCents(amount: string | undefined | null): number {
  return Math.round(Number.parseFloat(amount ?? "0") * 100);
}

export async function createDraftOrder(
  items: DraftOrderLineItem[],
  buyer: DraftOrderBuyer,
): Promise<{
  id: string;
  name: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}> {
  const input: Record<string, unknown> = {
    lineItems: items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    email: buyer.email,
    note: "Created by OmniBuy AI (verified purchase via MCP)",
    tags: ["agent-ready", "mcp", "ai-agent"],
    customAttributes: [{ key: "source", value: "omnibuy-ai" }],
    // Draft orders created through the Admin API do not select a shipping
    // rate on their own. The demo store ships free, so make that explicit
    // instead of leaving shipping undefined. Change this line (or add rates)
    // if the connected store charges shipping.
    shippingLine: { title: "Free shipping", price: "0.00" },
  };

  if (buyer.name || buyer.address) {
    const nameParts = (buyer.name ?? "").trim().split(/\s+/).filter(Boolean);
    const countryCode = (
      buyer.address?.countryCode ??
      buyer.address?.country ??
      ""
    )
      .trim()
      .toUpperCase();

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new Error(
        "Shipping address requires an ISO 3166-1 alpha-2 country code (for example US, CA, GB).",
      );
    }

    const provinceCode = (
      buyer.address?.provinceCode ??
      buyer.address?.province ??
      ""
    )
      .trim()
      .toUpperCase();

    if (provinceCode && !/^[A-Z0-9]{1,3}$/.test(provinceCode)) {
      throw new Error(
        "Shipping province/state must be a short code such as CA, NY or ON.",
      );
    }

    input.shippingAddress = {
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(" ") || undefined,
      address1: buyer.address?.address1,
      address2: buyer.address?.address2,
      city: buyer.address?.city,
      countryCode,
      provinceCode: provinceCode || undefined,
      zip: buyer.address?.zip,
      phone: buyer.address?.phone,
    };
  }

  const created = await shopifyGraphQL<DraftOrderCreateData>(
    DRAFT_ORDER_CREATE,
    { input },
  );

  assertNoUserErrors(
    created.draftOrderCreate.userErrors,
    "Shopify draftOrderCreate",
  );

  const draftOrder = created.draftOrderCreate.draftOrder;
  if (!draftOrder) {
    throw new Error("Shopify did not return a draft order");
  }

  return {
    id: draftOrder.id,
    name: draftOrder.name,
    currency: draftOrder.totalPriceSet.shopMoney.currencyCode,
    subtotalCents: toCents(draftOrder.subtotalPriceSet.shopMoney.amount),
    shippingCents: toCents(draftOrder.totalShippingPriceSet.shopMoney.amount),
    taxCents: toCents(draftOrder.totalTaxSet.shopMoney.amount),
    totalCents: toCents(draftOrder.totalPriceSet.shopMoney.amount),
  };
}

export async function completeDraftOrder(draftOrderId: string): Promise<{
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
}> {
  const completed = await shopifyGraphQL<DraftOrderCompleteData>(
    DRAFT_ORDER_COMPLETE,
    { id: draftOrderId, paymentPending: false },
  );

  try {
    assertNoUserErrors(
      completed.draftOrderComplete.userErrors,
      "Shopify draftOrderComplete",
    );
  } catch (error) {
    // A previous request can complete the draft order and then fail while
    // returning its restricted `order` field. Treat Shopify's idempotent
    // "already paid" response as success so PayPal retries do not duplicate
    // or strand the checkout.
    if (error instanceof Error && /(already paid|order has been paid)/i.test(error.message)) {
      return { shopifyOrderId: null, shopifyOrderName: null };
    }
    throw error;
  }

  const draftOrder = completed.draftOrderComplete.draftOrder;
  if (!draftOrder) {
    throw new Error("Shopify did not return the completed draft order");
  }

  return {
      // The order field requires read_orders, which is intentionally not
      // requested. Completing the draft order still creates the Shopify order.
      shopifyOrderId: null,
      shopifyOrderName: draftOrder.name,
  };
}

export async function decrementCachedStock(
  items: Array<{ shopifyVariantId: string; quantity: number }>,
  merchantId: string,
): Promise<void> {
  for (const item of items) {
    await db
      .update(variants)
      .set({
        stockCached: sql`greatest(${variants.stockCached} - ${item.quantity}, 0)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(variants.shopifyVariantId, item.shopifyVariantId),
          eq(variants.merchantId, merchantId),
        ),
      );
  }
}

export type ShopifyPublishVariant = {
  sku: string;
  title?: string;
  price: number;
  inventory: number;
};

export type ShopifyPublishedProduct = {
  productId: string;
  variants: Array<{ sku: string; id: string; inventoryItemId: string }>;
};

const PRODUCT_CREATE = /* GraphQL */ `
  mutation ProductCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_CREATE = /* GraphQL */ `
  mutation ProductVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id sku inventoryItem { id } }
      userErrors { field message }
    }
  }
`;

const LOCATIONS_QUERY = /* GraphQL */ `
  query Locations { locations(first: 1, includeInactive: false) { nodes { id } } }
`;

const INVENTORY_SET = /* GraphQL */ `
  mutation InventorySet($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }
`;

type PublishMutation = {
  productCreate?: { product: { id: string } | null; userErrors: Array<{ message: string }> };
  productVariantsBulkCreate?: { productVariants: Array<{ id: string; sku: string | null; inventoryItem: { id: string } }>; userErrors: Array<{ message: string }> };
};

/** Publishes one already-validated Catalog Hub product. Never accepts client prices. */
export async function publishCatalogProduct(input: {
  title: string;
  description: string;
  images: string[];
  variants: ShopifyPublishVariant[];
}): Promise<ShopifyPublishedProduct> {
  if (!input.variants.length) throw new Error("Cannot publish a product without variants");
  const created = await shopifyGraphQL<PublishMutation>(PRODUCT_CREATE, {
    input: { title: input.title, descriptionHtml: input.description, status: "ACTIVE" },
  });
  const productError = created.productCreate?.userErrors ?? [];
  assertNoUserErrors(productError.map((error) => ({ field: null, message: error.message })), "Shopify productCreate");
  const productId = created.productCreate?.product?.id;
  if (!productId) throw new Error("Shopify did not return the created product");

  if (input.images.length) {
    const media = await shopifyGraphQL<{ productCreateMedia: { userErrors: Array<{ message: string }> } }>(
      `mutation ProductMedia($productId: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $productId, media: $media) { userErrors { message } } }`,
      { productId, media: input.images.map((originalSource) => ({ mediaContentType: "IMAGE", originalSource })) },
    );
    assertNoUserErrors(media.productCreateMedia.userErrors.map((error) => ({ field: null, message: error.message })), "Shopify productCreateMedia");
  }

  const variants = await shopifyGraphQL<PublishMutation>(PRODUCT_VARIANTS_BULK_CREATE, {
    productId,
    variants: input.variants.map((variant) => ({
      price: variant.price.toFixed(2),
      inventoryItem: { sku: variant.sku },
      optionValues: [{ optionName: "Title", name: variant.title || "Default Title" }],
    })),
  });
  const variantError = variants.productVariantsBulkCreate?.userErrors ?? [];
  assertNoUserErrors(variantError.map((error) => ({ field: null, message: error.message })), "Shopify productVariantsBulkCreate");
  const saved = variants.productVariantsBulkCreate?.productVariants ?? [];
  if (saved.length !== input.variants.length) throw new Error("Shopify returned an incomplete variant list");

  const locations = await shopifyGraphQL<{ locations: { nodes: Array<{ id: string }> } }>(LOCATIONS_QUERY);
  const locationId = locations.locations.nodes[0]?.id;
  if (!locationId) throw new Error("Shopify has no active inventory location");
  const quantities = saved.map((variant, index) => ({
    inventoryItemId: variant.inventoryItem.id,
    locationId,
    quantity: input.variants[index].inventory,
    changeFromQuantity: 0,
  }));
  const inventory = await shopifyGraphQL<{ inventorySetQuantities: { userErrors: Array<{ message: string }> } }>(INVENTORY_SET, {
    input: { name: "available", reason: "correction", quantities },
    idempotencyKey: randomUUID(),
  });
  assertNoUserErrors(inventory.inventorySetQuantities.userErrors.map((error) => ({ field: null, message: error.message })), "Shopify inventorySetQuantities");
  return { productId, variants: saved.map((variant, index) => ({ sku: input.variants[index].sku, id: variant.id, inventoryItemId: variant.inventoryItem.id })) };
}
