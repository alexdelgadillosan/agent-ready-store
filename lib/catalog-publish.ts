import { eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { catalogProducts, catalogPublishJobs, catalogVariants } from "./schema";
import { publishCatalogProduct } from "./shopify";

export async function publishCatalog(options: { dryRun: boolean; sourceId?: string }) {
  const rows = await db.select({ product: catalogProducts, variant: catalogVariants })
    .from(catalogProducts)
    .innerJoin(catalogVariants, eq(catalogVariants.productId, catalogProducts.id))
    .where(isNull(catalogProducts.shopifyProductId));
  const grouped = new Map<string, { product: typeof rows[number]["product"]; variants: typeof rows[number]["variant"][] }>();
  for (const row of rows) {
    if (options.sourceId && row.product.sourceId !== options.sourceId) continue;
    const existing = grouped.get(row.product.id);
    if (existing) existing.variants.push(row.variant);
    else grouped.set(row.product.id, { product: row.product, variants: [row.variant] });
  }
  if (grouped.size === 0) return { status: "empty", dryRun: options.dryRun, productCount: 0, publishedCount: 0, failedCount: 0, errors: [] };
  const [job] = await db.insert(catalogPublishJobs).values({ dryRun: options.dryRun ? 1 : 0, productCount: grouped.size }).returning({ id: catalogPublishJobs.id });
  if (!job) throw new Error("Could not create publish job");
  if (options.dryRun) {
    await db.update(catalogPublishJobs).set({ status: "dry_run", publishedCount: grouped.size, finishedAt: new Date() }).where(eq(catalogPublishJobs.id, job.id));
    return { status: "dry_run", dryRun: true, jobId: job.id, productCount: grouped.size, publishedCount: grouped.size, failedCount: 0, errors: [] };
  }
  const errors: string[] = [];
  let publishedCount = 0;
  for (const { product, variants } of grouped.values()) {
    try {
      const published = await publishCatalogProduct({
        title: product.title,
        description: product.description,
        images: (product.images ?? []).map((image) => image.url),
        variants: variants.map((variant) => ({ sku: variant.sku, title: variant.title, price: variant.originalPriceCents / 100, inventory: variant.inventory })),
      });
      await db.transaction(async (tx) => {
        await tx.update(catalogProducts).set({ shopifyProductId: published.productId, publishStatus: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(catalogProducts.id, product.id));
        for (let index = 0; index < variants.length; index += 1) {
          await tx.update(catalogVariants).set({ shopifyVariantId: published.variants[index].id, shopifyInventoryItemId: published.variants[index].inventoryItemId, publishError: null, updatedAt: new Date() }).where(eq(catalogVariants.id, variants[index].id));
        }
      });
      publishedCount += 1;
    } catch (error) {
      const message = `${product.externalId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      await db.update(catalogProducts).set({ publishStatus: "error", updatedAt: new Date() }).where(eq(catalogProducts.id, product.id));
    }
  }
  await db.update(catalogPublishJobs).set({ status: errors.length ? "completed_with_errors" : "completed", publishedCount, failedCount: errors.length, errors, finishedAt: new Date() }).where(eq(catalogPublishJobs.id, job.id));
  return { status: errors.length ? "completed_with_errors" : "completed", dryRun: false, jobId: job.id, productCount: grouped.size, publishedCount, failedCount: errors.length, errors };
}
