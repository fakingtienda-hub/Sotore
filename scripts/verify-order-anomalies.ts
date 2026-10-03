import "dotenv/config";

import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import {
  countOrderAnomalies,
  getFlagsForOrders,
  hasIgnoredReason,
  hasUndeliveredProduct,
} from "../lib/server/order-anomalies";
import { IGNORED_REASON_AMOUNT_MISMATCH } from "../lib/server/order-approval";
import { grantOrderEntitlements } from "../lib/server/entitlements";
import { ORDER_STATUSES } from "../lib/constants";

/**
 * Verifica la definición de anomalías de órdenes. Sobre todo el SQL: Drizzle
 * valida los tipos pero no genera ni ejecuta las consultas, así que un `->>`
 * mal escrito o un `NOT EXISTS` mal correlacionado pasaría typecheck y reventaría
 * en producción, justo en la pantalla que hay que mirar cuando algo va mal.
 *
 * Casos:
 *   1. `approved` sin compra        -> `undelivered` (cobrado sin producto)
 *   2. `approved` con compra activa -> sin flags
 *   3. compra revocada              -> `undelivered`
 *   4. `ignoredReason`              -> `amount_mismatch`, en cualquier estado
 *   5. recompra de quien ya tenía el producto -> sin flags (no hay falsos positivos)
 *   6. la atribución `purchases.orderId` sigue a la orden quecede el acceso,
 *      que es lo que hace funcionar el reembolso
 *
 * Usa `grantOrderEntitlements` (sin `revalidatePath`) en vez de
 * `ensureOrderEntitlements`, porque el contexto de `revalidatePath` solo existe
 * dentro de una petición de Next.
 */

let failures = 0;

function assert(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

async function main() {
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!user) {
    throw new Error("No hay usuarios en la BD; corre `npm run db:seed` antes.");
  }

  // Usuario y producto propios del test, para no tocar datos reales.
  const uid = randomUUID();
  const pid = randomUUID();
  const tag = uid.slice(0, 8);

  await db.insert(schema.users).values({
    id: uid,
    role: "customer",
    name: "Verify Anomalies",
    email: `verify-anomalies-${tag}@example.invalid`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.products).values({
    id: pid,
    categoryId: null,
    title: `Verify anomalías ${tag}`,
    slug: `verify-anomalias-${tag}`,
    description: "Producto temporal del script de verificación.",
    shortDescription: "Temporal",
    price: 1000,
    compareAtPrice: null,
    currency: "COP",
    status: "draft",
    coverImageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  let seq = 0;
  async function makeOrder(status: string, extra: Partial<typeof schema.orders.$inferInsert> = {}) {
    seq += 1;
    const oid = randomUUID();
    const code = `VF-${tag}-${seq}`.toUpperCase();
    await db.insert(schema.orders).values({
      id: oid,
      code,
      userId: uid,
      status,
      subtotal: 1000,
      total: 1000,
      currency: "COP",
      ownerToken: randomUUID().replace(/-/g, ""),
      gateway: "wompi",
      paidAt: status === "approved" ? new Date() : null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...extra,
    });
    await db.insert(schema.orderItems).values({
      id: randomUUID(),
      orderId: oid,
      productId: pid,
      productTitleSnapshot: "Verify anomalías",
      unitPrice: 1000,
      quantity: 1,
      currency: "COP",
      createdAt: new Date(),
    });
    return oid;
  }

  const grant = (orderId: string, status: "active" | "revoked") =>
    db.insert(schema.purchases).values({
      id: randomUUID(),
      userId: uid,
      productId: pid,
      orderId,
      status,
      grantedAt: new Date(),
      revokedAt: status === "revoked" ? new Date() : null,
      createdAt: new Date(),
    });

  const load = async (id: string) => {
    const [row] = await db
      .select({
        id: schema.orders.id,
        status: schema.orders.status,
        paidAt: schema.orders.paidAt,
        userId: schema.orders.userId,
        gatewayPayload: schema.orders.gatewayPayload,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, id));
    if (!row) throw new Error("Orden no encontrada");
    return row;
  };

  console.log("--- definición de anomalías ---");

  // 1. approved sin compra => undelivered
  const o1 = await makeOrder("approved");
  const f1 = await getFlagsForOrders([await load(o1)]);
  assert("approved sin acceso -> undelivered", f1.get(o1)?.includes("undelivered") === true);

  // 2. approved con compra activa => sin flags
  await grant(o1, "active");
  const f2 = await getFlagsForOrders([await load(o1)]);
  assert("approved con acceso -> sin flags", (f2.get(o1) ?? []).length === 0);

  // 3. compra revocada => undelivered
  await db.update(schema.purchases).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.purchases.userId, uid));
  const f3 = await getFlagsForOrders([await load(o1)]);
  assert("acceso revocado -> undelivered", f3.get(o1)?.includes("undelivered") === true);

  // Reactivar es UPDATE, no INSERT: `purchases_user_product_idx` es UNIQUE.
  // (Es lo que hace `ensureOrderEntitlements` con `onConflictDoUpdate`.)
  await db
    .update(schema.purchases)
    .set({ status: "active", revokedAt: null })
    .where(eq(schema.purchases.userId, uid));
  const f3b = await getFlagsForOrders([await load(o1)]);
  assert("acceso reactivado -> sin flags", (f3b.get(o1) ?? []).length === 0);

  // 4. ignoredReason en el payload => amount_mismatch (aunque esté pending)
  const o4 = await makeOrder("pending", {
    gatewayPayload: { id: "tx-1", ignoredReason: IGNORED_REASON_AMOUNT_MISMATCH },
  });
  const f4 = await getFlagsForOrders([await load(o4)]);
  assert("ignoredReason -> amount_mismatch", f4.get(o4)?.includes("amount_mismatch") === true);

  // 5. Recompra de quien ya tiene el producto: no es anomalía
  const o5 = await makeOrder("approved");
  const f5 = await getFlagsForOrders([await load(o5)]);
  assert(
    "quien ya tenía el producto no se marca como anomalía",
    (f5.get(o5) ?? []).length === 0,
  );

  console.log("--- `undelivered` solo en órdenes aprobadas y recientes ---");

  // Regresión: antes `getFlagsForOrders` no miraba `status` ni `paidAt`, así que
  // marcaba como "sin entregar" cualquier orden pendiente o rechazada (que aún no
  // han pagado). El panel quedaba con anomalías permanentes y las reales se
  // perdían de vista.
  await db.update(schema.purchases).set({ status: "revoked", revokedAt: new Date() }).where(eq(schema.purchases.userId, uid));

  const pendingOrder = await makeOrder("pending");
  const fp = await getFlagsForOrders([await load(pendingOrder)]);
  assert(
    "pending sin compra activa NO es anomalía (aún no se pagó)",
    (fp.get(pendingOrder) ?? []).length === 0,
  );

  const declinedOrder = await makeOrder("declined");
  const fd = await getFlagsForOrders([await load(declinedOrder)]);
  assert(
    "declined sin compra activa NO es anomalía",
    (fd.get(declinedOrder) ?? []).length === 0,
  );

  // Y el caso real sigue detectándose: approved + pagado + sin entrega.
  const freshApproved = await makeOrder("approved");
  const ff = await getFlagsForOrders([await load(freshApproved)]);
  assert(
    "approved pagado sin entrega SÍ es anomalía",
    ff.get(freshApproved)?.includes("undelivered") === true,
  );

  // Approved pero pagado hace más de la ventana de escaneo: fuera del radar.
  const oldOrder = await makeOrder("approved", { paidAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) });
  const fo = await getFlagsForOrders([await load(oldOrder)]);
  assert(
    "approved anciento fuera de la ventana NO se escanea",
    (fo.get(oldOrder) ?? []).length === 0,
  );

  // Se reactiva para no arrastrar el estado a las comprobaciones siguientes.
  await db
    .update(schema.purchases)
    .set({ status: "active", revokedAt: null })
    .where(eq(schema.purchases.userId, uid));

  console.log("--- predicados SQL (lo que typecheck no valida) ---");

  const [undeliveredHit] = await db
    .select({ c: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.userId, uid), hasUndeliveredProduct()));
  assert("hasUndeliveredProduct() no marca a quien ya tiene el producto", undeliveredHit === undefined);

  const [mismatchHit] = await db
    .select({ c: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.userId, uid), hasIgnoredReason()));
  assert("hasIgnoredReason() lee el jsonb y encuentra la orden", mismatchHit?.c === o4);

  console.log("--- atribución de la compra (reembolso) ---");

  // Regresión: `purchases.orderId` es la atribución que usa
  // `revokeOrderEntitlements`. Si al reactivar una compra revocada no se
  // actualiza, un reembolso de la orden nueva no revoca nada.
  await db
    .update(schema.purchases)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(schema.purchases.userId, uid));

  // La fila existe y está revocada, apuntando a o1: ese es el estado que
  // dispara el bug.
  const g1 = await grantOrderEntitlements(o5);
  assert("reactivar tras revocación concede el acceso", g1.ok && g1.granted === 1);

  const [afterReactivate] = await db
    .select({ orderId: schema.purchases.orderId, status: schema.purchases.status })
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, uid));
  assert("la compra reactivada apunta a la orden nueva", afterReactivate?.orderId === o5);
  assert("la compra reactivada queda activa", afterReactivate?.status === "active");

  // El webhook revoca con `WHERE order_id = <orden>`. Debe alcanzar la fila.
  const [revocableByNewOrder] = await db
    .select({ id: schema.purchases.id })
    .from(schema.purchases)
    .where(and(eq(schema.purchases.userId, uid), eq(schema.purchases.orderId, o5)));
  assert("el reembolso de la orden nueva sí alcanza la compra", revocableByNewOrder !== undefined);

  // Y al revés: revocar la orden vieja NO debe tocar acceso que la nueva pagó.
  const [revocableByOldOrder] = await db
    .select({ id: schema.purchases.id })
    .from(schema.purchases)
    .where(and(eq(schema.purchases.userId, uid), eq(schema.purchases.orderId, o1)));
  assert("el reembolso de la orden vieja no toca el acceso vigente", revocableByOldOrder === undefined);

  // Acceso compartido: si ya está activo, la segunda orden NO debe robar la
  // atribución, porque su reembolso no debe quitar lo que la primera pagó.
  const o6 = await makeOrder("approved");
  const g2 = await grantOrderEntitlements(o6);
  assert("acceso ya activo -> no se vuelve a conceder", g2.ok && g2.granted === 0 && g2.existing === 1);
  const [shared] = await db
    .select({ orderId: schema.purchases.orderId })
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, uid));
  assert("acceso compartido conserva la atribución original", shared?.orderId === o5);

  console.log("--- conteos y catálogo ---");
  const counts = await countOrderAnomalies();
  assert(
    "countOrderAnomalies() devuelve ambos contadores",
    typeof counts.undelivered === "number" && typeof counts.amount_mismatch === "number",
  );
  assert("amount_mismatch cuenta la orden con ignoredReason", counts.amount_mismatch >= 1);
  assert("expired está en ORDER_STATUSES", (ORDER_STATUSES as readonly string[]).includes("expired"));

  // Limpieza
  await db.delete(schema.purchases).where(eq(schema.purchases.userId, uid));
  const itemIds = (
    await db
      .select({ id: schema.orderItems.id })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(eq(schema.orders.userId, uid))
  ).map((r) => r.id);
  if (itemIds.length > 0) {
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.id, itemIds));
  }
  await db.delete(schema.orders).where(eq(schema.orders.userId, uid));
  await db.delete(schema.products).where(eq(schema.products.id, pid));
  await db.delete(schema.users).where(eq(schema.users.id, uid));

  console.log(failures === 0 ? "\nOK: todas las verificaciones pasaron." : `\n${failures} fallo(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
