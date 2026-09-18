import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const EMAIL = "cliente-e2e@fakingstore.com";
const SLUG = "pack-costura-pro";
const COUPON = "TEST10";

let failed = 0;
function check(label: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
  if (!cond) failed += 1;
}

async function main() {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).limit(1);
  check("cliente creado como guest", !!user, user?.id ?? "n/a");

  const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, COUPON)).limit(1);
  check("cupón creado desde admin UI", !!coupon, coupon ? `${coupon.type} ${coupon.value}` : "n/a");

  const orders = user ? await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id)) : [];
  check("exactamente 1 orden", orders.length === 1, `count=${orders.length}`);
  const order = orders[0];
  if (order) {
    check("status pending", order.status === "pending", order.status);
    check("subtotal 29900 cols", order.subtotal === 29900, String(order.subtotal));
    check("discount 2990 (10%)", order.discount === 2990, String(order.discount));
    check("total 26910", order.total === 26910, String(order.total));
    check("código FS-", order.code.startsWith("FS-"), order.code);
    check("couponCode TEST10", order.couponCode === COUPON, String(order.couponCode));
    check("couponId set", order.couponId === coupon?.id, String(order.couponId));

    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    check("1 item", items.length === 1, `count=${items.length}`);
    if (items[0]) {
      check("item snapshot título", items[0].productTitleSnapshot === "Pack Costura Pro", items[0].productTitleSnapshot);
      check("item unitPrice 29900", items[0].unitPrice === 29900, String(items[0].unitPrice));
    }

    if (coupon) {
      const usages = await db.select().from(schema.couponUsages).where(eq(schema.couponUsages.orderId, order.id));
      check("coupon_usages registrado", usages.length === 1, `count=${usages.length}`);
      check("usedCount incrementado a 1", coupon.usedCount === 1, String(coupon.usedCount));
    }
  }

  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, SLUG)).limit(1);
  check("producto publicado", product?.status === "published", product?.status ?? "n/a");

  if (order) await db.delete(schema.orders).where(eq(schema.orders.id, order.id));
  if (coupon) {
    await db.delete(schema.couponUsages).where(eq(schema.couponUsages.couponId, coupon.id));
    await db.delete(schema.coupons).where(eq(schema.coupons.id, coupon.id));
  }
  if (product) await db.delete(schema.products).where(eq(schema.products.id, product.id));
  if (user) await db.delete(schema.users).where(eq(schema.users.id, user.id));

  const leftover = await db
    .select({ code: schema.orders.code })
    .from(schema.orders)
    .innerJoin(schema.users, eq(schema.orders.userId, schema.users.id))
    .where(eq(schema.users.email, EMAIL));
  check("limpieza BD completa", leftover.length === 0);

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});