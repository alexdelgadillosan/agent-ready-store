import { mkdir, writeFile } from "node:fs/promises";

const sitemap = "https://www.gymshark.com/sitemap_products_1.xml";
const limit = Number.parseInt(process.env.CATALOG_BATCH_SIZE || "25", 10);
const userAgent = "AgentCart/1.0 authorized catalog importer";

function csv(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function clean(value) {
  return String(value ?? "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/&amp;/g, "&")
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&#39;/g, "'")
    .replaceAll(/\s+/g, " ")
    .trim();
}

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent }, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

const xml = await get(sitemap);
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  .filter((url) => !/gift-card|bundle/i.test(url));
const products = [];
for (const url of urls) {
  if (products.length >= limit) break;
  try {
    const html = await get(url);
    const block = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!block) continue;
    const data = JSON.parse(block);
    if (data["@type"] !== "ProductGroup" || !Array.isArray(data.hasVariant)) continue;
    const variants = data.hasVariant.filter((variant) => variant?.sku && variant?.offers?.priceCurrency === "USD");
    if (!variants.length) continue;
    const id = `gymshark-${data.productGroupID || url.split("/").pop()}`;
    const images = [...new Set([...(Array.isArray(data.image) ? data.image : [data.image]), ...variants.map((variant) => variant.image)].filter(Boolean))].slice(0, 10);
    products.push({
      fixture: false,
      product_id: id,
      product_title: clean(data.name),
      product_description: clean(data.description),
      variants: variants.map((variant) => ({
        variant_id: variant.mpn || variant.sku,
        variant_title: variant.size || variant.color || "Default",
        sku: variant.sku,
        price: Number(variant.offers.price),
        inventory: /InStock/i.test(variant.offers.availability || "") ? 10 : 0,
      })),
      images,
      source_url: url,
    });
    console.log(`prepared ${products.length}/${limit}: ${data.name}`);
  } catch (error) {
    console.warn(`skipped ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (!products.length) throw new Error("No usable Gymshark products were found");
const grouped = new Map();
for (const product of products) {
  const existing = grouped.get(product.product_id);
  if (!existing) {
    grouped.set(product.product_id, product);
    continue;
  }
  const known = new Set(existing.variants.map((variant) => variant.sku));
  for (const variant of product.variants) {
    if (!known.has(variant.sku)) existing.variants.push(variant);
  }
  existing.images = [...new Set([...existing.images, ...product.images])].slice(0, 10);
}
const uniqueProducts = [...grouped.values()];
const rows = ["fixture,product_id,product_title,product_description,variant_id,variant_title,sku,original_price,currency,inventory,images,source_name,source_url,source_record_id,license_name,license_url,license_attribution"];
const emittedSkus = new Set();
for (const product of uniqueProducts) {
  for (const variant of product.variants) {
    if (emittedSkus.has(variant.sku)) continue;
    emittedSkus.add(variant.sku);
    rows.push([
      false, product.product_id, product.product_title, product.product_description, variant.variant_id, variant.variant_title, variant.sku,
      variant.price.toFixed(2), "USD", variant.inventory, product.images.join("|"), "Gymshark", product.source_url, product.product_id,
      "Merchant-authorized catalog use", product.source_url, "Gymshark catalog imported with merchant authorization",
    ].map(csv).join(","));
  }
}
await mkdir(".catalog-cache", { recursive: true });
await writeFile(".catalog-cache/gymshark-products.csv", `${rows.join("\n")}\n`);
console.log(`Wrote ${uniqueProducts.length} products and ${rows.length - 1} variants to .catalog-cache/gymshark-products.csv`);
