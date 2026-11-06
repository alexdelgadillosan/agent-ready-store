/**
 * Real concurrency test for inventory reservations.
 *
 * Requires DATABASE_URL pointing at a disposable Postgres database with the
 * schema applied (`npm run db:push`). It inserts a temporary merchant,
 * product and variant, races two reservations for the last unit, verifies
 * that exactly one wins, then cleans everything up.
 *
 * Run: DATABASE_URL=... npm run test:reservations
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../lib/db";
import {
  getAvailableStock,
  releaseReservations,
  reserveItems,
} from "../lib/reservations";
import { merchants, products, reservations, variants } from "../lib/schema";

const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function main() {
  const merchantId = randomUUID();
  const productId = randomUUID();
  const variantId = randomUUID();
  const cartA = randomUUID();
  const cartB = randomUUID();
  const shopifyVariantId = `gid://shopify/ProductVariant/test-${runId}`;
  const shopifyProductId = `gid://shopify/Product/test-${runId}`;

  console.log("Reservation concurrency test");
  console.log(`· variant ${shopifyVariantId} with stockCached=1`);

  try {
    await db.insert(merchants).values({
      id: merchantId,
      shopDomain: `reservation-test-${runId}.myshopify.com`,
      accessToken: "test-token",
    });

    await db.insert(products).values({
      id: productId,
      merchantId,
      shopifyProductId,
      title: "Temporary concurrency test product",
      description: "Created and deleted by scripts/test-reservations.ts",
    });

    await db.insert(variants).values({
      id: variantId,
      merchantId,
      productId,
      shopifyVariantId,
      title: "Default Title",
      sku: "TEST-RACE",
      priceCents: 1000,
      currency: "USD",
      stockCached: 1,
    });

    const results = await Promise.allSettled([
      reserveItems([{ variantId, quantity: 1 }], cartA),
      reserveItems([{ variantId, quantity: 1 }], cartB),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;

    console.log(`· results: ${fulfilled} fulfilled, ${rejected} rejected`);

    if (fulfilled !== 1 || rejected !== 1) {
      throw new Error(
        `Expected exactly one winner, got fulfilled=${fulfilled} rejected=${rejected}`,
      );
    }

    const availableAfterRace = (
      await getAvailableStock([variantId])
    ).get(variantId);

    console.log(`· available after race: ${availableAfterRace}`);

    if (availableAfterRace !== 0) {
      throw new Error(`Expected 0 available, got ${availableAfterRace}`);
    }

    await releaseReservations(cartA);
    await releaseReservations(cartB);

    const availableAfterRelease = (
      await getAvailableStock([variantId])
    ).get(variantId);

    console.log(`· available after release: ${availableAfterRelease}`);

    if (availableAfterRelease !== 1) {
      throw new Error(
        `Expected 1 available after release, got ${availableAfterRelease}`,
      );
    }

    console.log("PASS: no overselling, release restores availability.");
  } finally {
    await db
      .delete(reservations)
      .where(eq(reservations.variantId, variantId));
    await db.delete(variants).where(eq(variants.id, variantId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(merchants).where(eq(merchants.id, merchantId));
    await pool.end();
  }
}

main().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
