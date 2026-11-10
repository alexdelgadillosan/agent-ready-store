import { z } from "zod";
import { db } from "./db";
import {
  catalogImports,
  catalogProducts,
  catalogProvenance,
  catalogSources,
  catalogVariants,
} from "./schema";

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "must be an HTTPS URL");
const license = z.object({
  name: z.string().min(1).max(200),
  url: httpsUrl,
  attribution: z.string().max(500).optional(),
}).strict();
const source = z.object({
  name: z.string().min(1).max(200),
  url: httpsUrl,
  record_id: z.string().min(1).max(200),
}).strict();
const image = z.object({ url: httpsUrl, alt: z.string().min(1).max(500), license }).strict();
const variant = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
  sku: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
  title: z.string().max(200).optional(),
  original_price: z.number().positive().multipleOf(0.01),
  currency: z.string().regex(/^[A-Z]{3}$/),
  inventory: z.number().int().nonnegative(),
}).strict();
const product = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  source,
  license,
  images: z.array(image).max(50),
  variants: z.array(variant).min(1),
}).strict();
const envelope = z.object({ schema_version: z.literal("catalog-hub.product.v1"), fixture: z.boolean(), product }).strict();

export type CatalogProduct = z.infer<typeof product>;
export type CatalogEnvelope = z.infer<typeof envelope>;
export type CatalogImportFormat = "json" | "csv";

export type ImportResult = {
  format: CatalogImportFormat;
  fixture: boolean;
  products: CatalogProduct[];
  productCount: number;
  variantCount: number;
  warnings: string[];
};

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((value) => value.some((cell) => cell.length > 0));
}

const csvHeaders = ["fixture", "product_id", "product_title", "product_description", "variant_id", "variant_title", "sku", "original_price", "currency", "inventory", "images", "source_name", "source_url", "source_record_id", "license_name", "license_url", "license_attribution"];

function parseCsvProducts(input: string): { products: CatalogProduct[]; fixture: boolean } {
  const rows = parseCsv(input);
  if (!rows.length || rows[0].join(",") !== csvHeaders.join(",")) throw new Error("CSV header does not match the Catalog Hub contract");
  const groups = new Map<string, CatalogProduct & { __repeated: string }>();
  const fixtureValues = new Set<string>();
  const skus = new Set<string>();
  rows.slice(1).forEach((values, index) => {
    if (values.length !== csvHeaders.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${csvHeaders.length}`);
    const at = (name: string) => values[csvHeaders.indexOf(name)];
    if (at("fixture") !== "true" && at("fixture") !== "false") throw new Error(`CSV row ${index + 2} has invalid fixture value`);
    fixtureValues.add(at("fixture"));
    const id = at("product_id");
    const repeated = JSON.stringify([at("fixture"), at("product_title"), at("product_description"), at("images"), at("source_name"), at("source_url"), at("source_record_id"), at("license_name"), at("license_url"), at("license_attribution")]);
    const existing = groups.get(id);
    if (existing && existing.__repeated !== repeated) throw new Error(`CSV rows disagree for product ${id}`);
    if (skus.has(at("sku"))) throw new Error(`CSV SKU is duplicated: ${at("sku")}`);
    skus.add(at("sku"));
    const imageUrls = at("images").split("|").filter(Boolean);
    const parsedVariant = { id: at("variant_id"), title: at("variant_title"), sku: at("sku"), original_price: Number(at("original_price")), currency: at("currency"), inventory: Number(at("inventory")) };
    if (existing) existing.variants.push(parsedVariant);
    else groups.set(id, { id, title: at("product_title"), description: at("product_description"), source: { name: at("source_name"), url: at("source_url"), record_id: at("source_record_id") }, license: { name: at("license_name"), url: at("license_url"), attribution: at("license_attribution") || undefined }, images: imageUrls.map((url) => ({ url, alt: at("product_title"), license: { name: at("license_name"), url: at("license_url"), attribution: at("license_attribution") || undefined } })), variants: [parsedVariant], __repeated: repeated });
  });
  const values = Array.from(groups.values()).map(({ __repeated: _, ...value }) => value);
  const checked = z.array(product).safeParse(values);
  if (!checked.success) throw new Error(`CSV data does not match the Catalog Hub contract: ${checked.error.message}`);
  return { products: checked.data, fixture: fixtureValues.size === 1 && fixtureValues.has("true") };
}

export function validateCatalogInput(input: unknown, format?: CatalogImportFormat): ImportResult {
  let products: CatalogProduct[];
  let actualFormat = format;
  let fixture = false;
  if (typeof input === "string") {
    actualFormat ??= input.trimStart().startsWith("{") ? "json" : "csv";
    if (actualFormat === "csv") { const parsed = parseCsvProducts(input); products = parsed.products; fixture = parsed.fixture; }
    else { const parsed = envelope.parse(JSON.parse(input)); fixture = parsed.fixture; products = [parsed.product]; }
  } else {
    actualFormat = "json";
    const parsed = envelope.parse(input); fixture = parsed.fixture; products = [parsed.product];
  }
  if (!products.length) throw new Error("Import contains no products");
  const seenProductIds = new Set<string>();
  const seenSkus = new Set<string>();
  for (const item of products) {
    if (seenProductIds.has(item.id)) throw new Error(`Product ID is duplicated: ${item.id}`);
    seenProductIds.add(item.id);
    for (const itemVariant of item.variants) {
      if (seenSkus.has(itemVariant.sku)) throw new Error(`SKU is duplicated: ${itemVariant.sku}`);
      seenSkus.add(itemVariant.sku);
    }
  }
  return { format: actualFormat, fixture, products, productCount: products.length, variantCount: products.reduce((total, item) => total + item.variants.length, 0), warnings: ["Catalog Hub data is stored as source data and is not published to Shopify or checkout."] };
}

export async function commitCatalogImport(result: ImportResult, payload: unknown) {
  return db.transaction(async (tx) => {
    const [record] = await tx.insert(catalogImports).values({ format: result.format, mode: "commit", fixture: result.fixture ? 1 : 0, status: "committed", productCount: result.productCount, variantCount: result.variantCount, payload }).returning({ id: catalogImports.id });
    for (const item of result.products) {
      const [src] = await tx.insert(catalogSources).values({ name: item.source.name, url: item.source.url, recordId: item.source.record_id, licenseName: item.license.name, licenseUrl: item.license.url, licenseAttribution: item.license.attribution }).onConflictDoUpdate({ target: [catalogSources.url, catalogSources.recordId], set: { name: item.source.name, licenseName: item.license.name, licenseUrl: item.license.url, licenseAttribution: item.license.attribution } }).returning({ id: catalogSources.id });
      const [savedProduct] = await tx.insert(catalogProducts).values({ sourceId: src.id, externalId: item.id, title: item.title, description: item.description ?? "", images: item.images }).onConflictDoUpdate({ target: [catalogProducts.sourceId, catalogProducts.externalId], set: { title: item.title, description: item.description ?? "", images: item.images, updatedAt: new Date() } }).returning({ id: catalogProducts.id });
      for (const itemVariant of item.variants) await tx.insert(catalogVariants).values({ productId: savedProduct.id, externalId: itemVariant.id, title: itemVariant.title ?? "", sku: itemVariant.sku, originalPriceCents: Math.round(itemVariant.original_price * 100), currency: itemVariant.currency, inventory: itemVariant.inventory }).onConflictDoUpdate({ target: [catalogVariants.productId, catalogVariants.externalId], set: { title: itemVariant.title ?? "", sku: itemVariant.sku, originalPriceCents: Math.round(itemVariant.original_price * 100), currency: itemVariant.currency, inventory: itemVariant.inventory, updatedAt: new Date() } });
      await tx.insert(catalogProvenance).values({ importId: record.id, entityType: "product", entityKey: item.id, sourceUrl: item.source.url, sourceRecordId: item.source.record_id, licenseName: item.license.name, licenseUrl: item.license.url, attribution: item.license.attribution });
    }
    return record.id;
  });
}
