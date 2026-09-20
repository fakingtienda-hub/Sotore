import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

const databaseUrl = process.env.DATABASE_URL!;
const queryClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(queryClient, { schema, casing: "snake_case" });

const EMAIL1 = process.env.FASE14_EMAIL1 ?? "fase14-e2e@fakingstore.com";
const EMAIL2 = process.env.FASE14_EMAIL2 ?? "fase14-pend@fakingstore.com";
const EMAIL3 = process.env.FASE14_EMAIL3 ?? "fase14-cupon@fakingstore.com";
const COUPON = process.env.FASE14_COUPON ?? "WELCOME10";
const COUPON_BEFORE = Number(process.env.FASE14_COUPON_BEFORE ?? "0");

const MODE = process.argv[2] ?? "--check";

let failed = 0;
function check(label: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
  if (!cond) failed += 1;
}

async function cleanupEmail(email: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) return;
  const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id));
  const purchases = await db.select().from(schema.purchases).where(eq(schema.purchases.userId, user.id));
  const purchaseIds = purchases.map((p) => p.id);
  const orderIds = orders.map((o) => o.id);

  await db.delete(schema.downloads).where(eq(schema.downloads.userId, user.id));
  if (orderIds.length > 0) {
    for (const oid of orderIds) {
      await db.delete(schema.couponUsages).where(eq(schema.couponUsages.orderId, oid));
    }
  }
  if (purchaseIds.length > 0) {
    for (const pid of purchaseIds) {
      await db.delete(schema.purchases).where(eq(schema.purchases.id, pid));
    }
  }
  if (orderIds.length > 0) {
    for (const oid of orderIds) {
      await db.delete(schema.orderItems).where(eq(schema.orderItems.orderId, oid));
      await db.delete(schema.orders).where(eq(schema.orders.id, oid));
    }
  }
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
}

async function main() {
  if (MODE === "--pre") {
    await cleanupEmail(EMAIL1);
    await cleanupEmail(EMAIL2);
    await cleanupEmail(EMAIL3);
    const [coupon] = await db.select({ usedCount: schema.coupons.usedCount }).from(schema.coupons).where(eq(schema.coupons.code, COUPON)).limit(1);
    console.log(`usedCount=${coupon?.usedCount ?? -1}`);
    await queryClient.end();
    process.exit(0);
  }

  // ── --check ─────────────────────────────────────────────────────────
  const [u1] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL1)).limit(1);
  check("buyer1 guest creado", !!u1, u1?.id ?? "n/a");
  const [u2] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL2)).limit(1);
  check("buyer2 guest creado", !!u2, u2?.id ?? "n/a");
  const [u3] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL3)).limit(1);
  check("buyer3 guest creado", !!u3, u3?.id ?? "n/a");

  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, "pack-costura-pro")).limit(1);
  check("producto pack-costura-pro existe", !!product, product?.id ?? "n/a");
  const [file] = product
    ? await db.select().from(schema.productFiles).where(eq(schema.productFiles.productId, product.id)).limit(1)
    : [];
  check("product_file demo-patron.pdf presente", !!file, file?.name ?? "n/a");

  if (u1 && product) {
    const orders1 = await db.select().from(schema.orders).where(eq(schema.orders.userId, u1.id));
    check("buyer1: exactamente 1 orden", orders1.length === 1, `count=${orders1.length}`);
    const o1 = orders1[0];
    if (o1) {
      check("buyer1: orden approved", o1.status === "approved", o1.status);
      check("buyer1: gateway demo", o1.gateway === "demo", String(o1.gateway));
      check("buyer1: paidAt definido", o1.paidAt != null, o1.paidAt?.toISOString() ?? "null");
      check("buyer1: sin cupón", o1.couponId == null, String(o1.couponId));
      const purchases1 = await db.select().from(schema.purchases).where(eq(schema.purchases.userId, u1.id));
      check("buyer1: 1 purchase activa", purchases1.length === 1 && purchases1[0].status === "active", `count=${purchases1.length}`);
      const downloads1 = await db.select().from(schema.downloads).where(eq(schema.downloads.userId, u1.id)).limit(1);
      check("buyer1: descarga registrada (única tras éxito)", downloads1.length === 1, `count=${downloads1.length}`);
    }
  }

  if (u2) {
    const orders2 = await db.select().from(schema.orders).where(eq(schema.orders.userId, u2.id));
    check("buyer2: exactamente 1 orden (pendiente, sin aprobar)", orders2.length === 1 && orders2[0].status === "pending", orders2.map((o) => o.status).join() || "sin orden");
    const purchases2 = await db.select().from(schema.purchases).where(eq(schema.purchases.userId, u2.id));
    check("buyer2: SIN entitlements (pendiente no entrega)", purchases2.length === 0, `count=${purchases2.length}`);
  }

  if (u3 && product && file) {
    const orders3 = await db.select().from(schema.orders).where(eq(schema.orders.userId, u3.id));
    check("buyer3: exactamente 1 orden", orders3.length === 1, `count=${orders3.length}`);
    const o3 = orders3[0];
    if (o3) {
      check("buyer3: approved + cupón aplicado", o3.status === "approved" && o3.couponCode === COUPON, `${o3.status}/${o3.couponCode}`);
      const usages3 = await db.select().from(schema.couponUsages).where(eq(schema.couponUsages.orderId, o3.id));
      check("cupón: 1 usage para la orden aprobada", usages3.length === 1, `count=${usages3.length}`);
      const usages2 = u2
        ? await db.select().from(schema.couponUsages).where(eq(schema.couponUsages.userId, u2.id))
        : [];
      check("cupón: NO consumido en orden pendiente", usages2.length === 0, `count=${usages2.length}`);
    }
    const [coupon] = await db.select({ usedCount: schema.coupons.usedCount }).from(schema.coupons).where(eq(schema.coupons.code, COUPON)).limit(1);
    const delta = (coupon?.usedCount ?? 0) - COUPON_BEFORE;
    check("cupón: usedCount sube EXACTAMENTE 1 (solo al aprobar)", delta === 1, `before=${COUPON_BEFORE} now=${coupon?.usedCount ?? "n/a"} delta=${delta}`);
  }

  // ── Cleanup E2E ─────────────────────────────────────────────────────
  await cleanupEmail(EMAIL1);
  await cleanupEmail(EMAIL2);
  await cleanupEmail(EMAIL3);

  const leftovers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, EMAIL1));
  check("limpieza BD completa", leftovers.length === 0);

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await queryClient.end();
  process.exit(1);
});