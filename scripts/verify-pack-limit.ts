import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";

/**
 * El fix del límite de descargas del pack depende de una distinción sutil de
 * Drizzle: dentro de `db.transaction`, un `return` COMMITEA y un `throw` hace
 * ROLLBACK. El borrador anterior usaba `return` al detectar un archivo agotado,
 * lo que confirmaba las inserciones de los archivos ya contados antes.
 * Este script comprueba esa semántica contra la base real.
 */
class AbortSignal extends Error {}

let failures = 0;
function assert(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const uid = randomUUID();
const pid = randomUUID();
const orderId = randomUUID();
const purchaseId = randomUUID();

const downloads = () =>
  db.select({ id: schema.downloads.id }).from(schema.downloads).where(eq(schema.downloads.userId, uid));

async function main() {
  console.log("--- semantica de transaccion (return vs throw) ---");

  await db.insert(schema.users).values({
    id: uid,
    name: "Verify pack",
    email: `pack-tx-${uid}@local.test`,
    emailVerified: true,
    role: "customer",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.products).values({
    id: pid,
    slug: `pack-tx-${uid}`,
    title: "Verify pack",
    price: 1000,
    currency: "COP",
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.orders).values({
    id: orderId,
    code: `PACK-${uid.slice(0, 8)}`,
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
  await db.insert(schema.purchases).values({
    id: purchaseId,
    userId: uid,
    productId: pid,
    orderId,
    status: "active",
    createdAt: new Date(),
  });

  const groupId = randomUUID();
  await db.insert(schema.productFileGroups).values({
    id: groupId,
    productId: pid,
    name: "Verify pack",
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const file = async (tag: string) => {
    const id = randomUUID();
    await db.insert(schema.productFiles).values({
      id,
      productId: pid,
      groupId,
      name: `${tag}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      storageKey: `products/${pid}/${groupId}/${tag}.pdf`,
      downloadLimit: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  };

  // Caso A: `return` en mitad del bucle CONFIRMA lo ya insertado (el bug).
  const a1 = await file("a1");
  await db.transaction(async (tx) => {
    await tx.insert(schema.downloads).values({ id: randomUUID(), userId: uid, productId: pid, fileId: a1, purchaseId, createdAt: new Date() });
    return; // "archivo siguiente agotado"
  });
  const afterReturn = (await downloads()).length;
  assert("`return` dentro de la transaccion COMMITEA (por eso habia que usar throw)", afterReturn === 1, `filas=${afterReturn}`);

  await db.delete(schema.downloads).where(eq(schema.downloads.userId, uid));

  // Caso B: `throw` ABORTA y no deja rastro (el fix aplicado al pack).
  const b1 = await file("b1");
  await db
    .transaction(async (tx) => {
      await tx.insert(schema.downloads).values({ id: randomUUID(), userId: uid, productId: pid, fileId: b1, purchaseId, createdAt: new Date() });
      throw new AbortSignal();
    })
    .catch((cause) => {
      if (!(cause instanceof AbortSignal)) throw cause;
    });
  const afterThrow = (await downloads()).length;
  assert("`throw` dentro de la transaccion hace ROLLBACK", afterThrow === 0, `filas=${afterThrow}`);

  await db.delete(schema.downloads).where(eq(schema.downloads.userId, uid));
  await db.delete(schema.productFiles).where(eq(schema.productFiles.productId, pid));
  await db.delete(schema.productFileGroups).where(eq(schema.productFileGroups.id, groupId));
  await db.delete(schema.purchases).where(eq(schema.purchases.id, purchaseId));
  await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
  await db.delete(schema.products).where(eq(schema.products.id, pid));
  await db.delete(schema.users).where(eq(schema.users.id, uid));

  console.log(failures === 0 ? "\nOK: todas las verificaciones pasaron." : `\nFALLARON ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
