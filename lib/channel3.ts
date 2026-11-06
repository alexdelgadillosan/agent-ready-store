import { env } from "./env";

const CHANNEL3_SEARCH_URL = "https://api.trychannel3.com/v1/search";

export function isChannel3Configured(): boolean {
  return env.channel3ApiKey.trim().length > 0;
}

type Channel3Price = {
  price: number;
  compare_at_price?: number | null;
  currency: string;
};

type Channel3Offer = {
  url: string;
  domain: string;
  price: Channel3Price;
  availability: "InStock" | "OutOfStock";
  condition?: "new" | "used" | null;
  max_commission_rate?: number;
};

type Channel3Product = {
  id: string;
  title: string;
  description?: string | null;
  brands?: Array<{ id: string; name: string }>;
  images?: Array<{
    url: string;
    cleaned_url?: string | null;
    is_main_image?: boolean;
    alt_text?: string | null;
  }>;
  category?: { slug: string; title: string; path?: string[] } | null;
  offers?: Channel3Offer[];
};

type Channel3SearchResponse = {
  products?: Channel3Product[];
  next_page_token?: string | null;
  detail?: string;
  message?: string;
};

export type ExternalOffer = {
  retailer: string;
  price: number;
  currency: string;
  condition: string | null;
  url: string;
};

export type ExternalProduct = {
  external_product_id: string;
  title: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  lowest_price: number | null;
  currency: string | null;
  offers: ExternalOffer[];
};

export type ExternalSearchInput = {
  query: string;
  maxPriceCents?: number;
  limit?: number;
};

/**
 * Searches Channel3's real product graph (100M+ products across retailers).
 *
 * These results are external retailer offers. They are intentionally kept out
 * of the Shopify cart flow: create_cart only accepts Shopify variant GIDs from
 * the merchant's own catalog.
 */
export async function searchExternalProducts(
  input: ExternalSearchInput,
): Promise<{ source: "Channel3"; products: ExternalProduct[] }> {
  if (!isChannel3Configured()) {
    throw new Error(
      "Channel3 is not configured. Set CHANNEL3_API_KEY to enable external product discovery.",
    );
  }

  const limit = Math.max(1, Math.min(input.limit ?? 8, 30));

  const filters: Record<string, unknown> = {
    availability: ["InStock"],
    conditions: ["new"],
  };

  if (typeof input.maxPriceCents === "number") {
    // Channel3 prices are decimal dollars, the MCP contract uses cents.
    filters.price = { max_price: input.maxPriceCents / 100 };
  }

  const response = await fetch(CHANNEL3_SEARCH_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.channel3ApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      limit,
      filters,
      config: { mode: "default" },
    }),
    cache: "no-store",
  });

  const json = (await response.json()) as Channel3SearchResponse;

  if (!response.ok) {
    throw new Error(
      `Channel3 search failed (${response.status}): ${
        json.detail ?? json.message ?? "unknown error"
      }`,
    );
  }

  const products: ExternalProduct[] = (json.products ?? [])
    .map((product) => {
      const offers = (product.offers ?? [])
        .filter((offer) => offer.availability === "InStock")
        .sort((a, b) => a.price.price - b.price.price)
        .slice(0, 3)
        .map<ExternalOffer>((offer) => ({
          retailer: offer.domain,
          price: offer.price.price,
          currency: offer.price.currency,
          condition: offer.condition ?? null,
          url: offer.url,
        }));

      const mainImage =
        product.images?.find((image) => image.is_main_image) ??
        product.images?.[0];

      return {
        external_product_id: product.id,
        title: product.title,
        brand: product.brands?.[0]?.name ?? null,
        category: product.category?.title ?? null,
        image_url: mainImage?.cleaned_url ?? mainImage?.url ?? null,
        lowest_price: offers[0]?.price ?? null,
        currency: offers[0]?.currency ?? null,
        offers,
      };
    })
    .filter((product) => product.offers.length > 0);

  return { source: "Channel3", products };
}
