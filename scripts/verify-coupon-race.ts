import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import postgres from "postgres";

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { releaseCouponForOrder } from "../lib/server/coupon-usage";

/**
 * Verifica que `releaseCouponForOrder` no descuente `usedCount` dos veces.
 *
 * La carrera es difícil de provocar por suerte (dos llamadas en paralelo suelen
 * serializarse en el pool), así que aquí se FUERZA la interleaving: un
 * conexión aparte toma el lock de la fila del cupón, de modo que las dos
 * llamadas completan su SELECT y se quedan esperando en el mismo lock. Al
 * liberarlo, las dos ejecutan su parte a la vez.
 */
let failures = 0;
function assert(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const uid = randomUUID();
const pid = randomUUID();
const orderId = randomUUID();
const couponId = randomUUID();
const usageId = randomUUID();

async function currentUsed() {
  const [row] = await db
    .select({ used: schema.coupons.usedCount })
    .from(schema.coupons)
    .where(eq(schema.coupons.id, couponId));
  return row?.used;
}

async function currentUsages() {
  const rows = await db
    .select({ id: schema.couponUsages.id })
    .from(schema.couponUsages)
    .where(eq(schema.couponUsages.orderId, orderId));
  return rows.length;
}

async function main() {
  console.log("--- carrera en releaseCouponForOrder ---");

  await db.insert(schema.users).values({
    id: uid,
    name: "Verify cupones",
    email: `coupon-race-${uid}@local.test`,
    emailVerified: true,
    role: "customer",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.products).values({
    id: pid,
    slug: `coupon-race-${uid}`,
    title: "Verify cupones",
    price: 1000,
    currency: "COP",
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.orders).values({
    id: orderId,
    code: `RACE-${uid.slice(0, 8)}`,
    userId: uid,
    status: "approved",
    subtotal: 1000,
    total: 1000,
    currency: "COP",
    ownerToken: randomUUID().replace(/-/g, ""),
    gateway: "wompi",
    paidAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.coupons).values({
    id: couponId,
    code: `RACE${uid.slice(0, 6).toUpperCase()}`,
    type: "fixed",
    value: 100,
    usedCount: 3,
    maxUses: 10,
    startsAt: new Date(Date.now() - 86_400_000),
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.couponUsages).values({
    id: usageId,
    couponId,
    orderId,
    userId: uid,
    usedAt: new Date(),
  });

  assert("punto de partida: usedCount=3 y 1 uso", (await currentUsed()) === 3 && (await currentUsages()) === 1);

  // Bloqueador: retiene el lock de la fila del cupón para que las dos llamadas
  // entren a su transacción DESPUÉS de haber leído su propia fila de uso.
  //
  // Ojo con el orden: las llamadas se lanzan y se ESPERAN fuera de la
  // transacción bloqueadora. Si el `await` de las dos appelé estuviera dentro,
  // se haría deadlock (la bloqueadora no soltaría el lock hasta que terminen, y
  // ellas no terminan hasta que se lo suelte).
  const blocker = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  let pending: Promise<unknown> = Promise.resolve();

  const blockerTx = blocker.begin(async (tx) => {
    await tx`SELECT id FROM coupons WHERE id = ${couponId} FOR UPDATE`;
    pending = Promise.all([releaseCouponForOrder(orderId), releaseCouponForOrder(orderId)]);
    // Margen para que ambas llamadas terminen su SELECT y queden esperando en el
    // lock del cupón. Devolver de aquí hace COMMIT y libera el lock.
    await new Promise((r) => setTimeout(r, 1500));
  });

  await Promise.race([blockerTx, new Promise((r) => setTimeout(r, 30_000))]);
  await pending;
  await blocker.end({ timeout: 5 }).catch(() => {});

  const used = await currentUsed();
  const usages = await currentUsages();

  assert(
    "dos llamadas concurrentes descuentan UNA sola vez",
    used === 2,
    `usedCount=${used} (esperado 2)${used === 1 ? " <- descontado dos veces" : ""}`,
  );
  assert("la fila de uso queda borrada", usages === 0, `usos restantes=${usages}`);

  await releaseCouponForOrder(orderId);
  assert("una llamada posterior no vuelve a descontar", (await currentUsed()) === 2, `usedCount=${await currentUsed()}`);

  await db.delete(schema.couponUsages).where(eq(schema.couponUsages.orderId, orderId));
  await db.delete(schema.coupons).where(eq(schema.coupons.id, couponId));
  await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
  await db.delete(schema.products).where(eq(schema.products.id, pid));
  await db.delete(schema.users).where(eq(schema.users.id, uid));

  console.log(failures === 0 ? "\nOK: todas las verificaciones pasaron." : `\nFALLARON ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
