import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { reservations, variants } from "./schema";

const RESERVATION_TTL_MINUTES = 10;

export type ReservationItem = {
  variantId: string;
  quantity: number;
};

export async function getAvailableStock(
  variantIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (variantIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      id: variants.id,
      stockCached: variants.stockCached,
    })
    .from(variants)
    .where(inArray(variants.id, variantIds));

  const reservedRows = await db
    .select({
      variantId: reservations.variantId,
      reserved: sql<string>`coalesce(sum(${reservations.quantity}), 0)`,
    })
    .from(reservations)
    .where(
      and(
        inArray(reservations.variantId, variantIds),
        eq(reservations.status, "active"),
        gt(reservations.expiresAt, new Date()),
      ),
    )
    .groupBy(reservations.variantId);

  const reservedByVariant = new Map(
    reservedRows.map((row) => [row.variantId, Number(row.reserved)]),
  );

  for (const row of rows) {
    result.set(row.id, row.stockCached - (reservedByVariant.get(row.id) ?? 0));
  }

  return result;
}

export async function reserveItems(
  items: ReservationItem[],
  cartId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${item.variantId}))`,
      );

      const [variant] = await tx
        .select()
        .from(variants)
        .where(eq(variants.id, item.variantId))
        .limit(1);

      if (!variant) {
        throw new Error(`Variant not found: ${item.variantId}`);
      }

      const [reservedRow] = await tx
        .select({
          reserved: sql<string>`coalesce(sum(${reservations.quantity}), 0)`,
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.variantId, item.variantId),
            eq(reservations.status, "active"),
            gt(reservations.expiresAt, new Date()),
          ),
        );

      const available =
        variant.stockCached - Number(reservedRow?.reserved ?? 0);

      if (available < item.quantity) {
        throw new Error(
          `Insufficient stock for ${variant.title}: available ${available}, requested ${item.quantity}`,
        );
      }

      await tx.insert(reservations).values({
        variantId: item.variantId,
        cartId,
        quantity: item.quantity,
        status: "active",
        expiresAt: new Date(
          Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000,
        ),
      });
    }
  });
}

export async function releaseReservations(cartId: string): Promise<void> {
  await db
    .update(reservations)
    .set({ status: "released" })
    .where(
      and(
        eq(reservations.cartId, cartId),
        eq(reservations.status, "active"),
      ),
    );
}

export async function consumeReservations(cartId: string): Promise<void> {
  await db
    .update(reservations)
    .set({ status: "consumed" })
    .where(
      and(
        eq(reservations.cartId, cartId),
        eq(reservations.status, "active"),
      ),
    );
}

export async function expireStaleReservations(): Promise<void> {
  await db
    .update(reservations)
    .set({ status: "expired" })
    .where(
      and(
        eq(reservations.status, "active"),
        sql`${reservations.expiresAt} < now()`,
      ),
    );
}
