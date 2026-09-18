import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { buildWompiCheckoutFields, generateIntegritySignature, getWompiConfig } from "@/lib/server/wompi";

const EMAIL = "fase7-e2e@fakingstore.com";
const SLUG = "pack-costura-pro";

let failed = 0;
function check(label: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
  if (!cond) failed += 1;
}

async function main() {
  // 1) Ejemplo oficial de los docs: sha256("sk8-...sn2m2490000COPprod_integrity_...")
  const sig = generateIntegritySignature(
    { reference: "sk8-438k4-xmxm392-sn2m", amountInCents: 2490000, currency: "COP" },
    "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6",
  );
  check(
    "firma integridad = ejemplo docs",
    sig === "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5",
    sig,
  );

  // 2) Config vacía esperada en este entorno (sin llaves de sandbox)
  const config = getWompiConfig();
  check("wompi no configurado (sin llaves)", config.configured === false);

  // 3) Campos del Web Checkout (build local con llaves falsas)
  const fields = buildWompiCheckoutFields({
    publicKey: "pub_test_fake",
    reference: "FS-DEMO",
    amountInCents: 26910,
    currency: "COP",
    customerEmail: "cliente@example.com",
    customerFullName: "Cliente Demo",
    redirectUrl: "https://localhost/checkout/payment-result?order=FS-DEMO",
  });
  const names = fields.map((f) => f.name);
  check(
    "campos checkout esperados",
    names.includes("public-key") &&
      names.includes("currency") &&
      names.includes("amount-in-cents") &&
      names.includes("reference") &&
      names.includes("signature:integrity") &&
      names.includes("redirect-url") &&
      names.includes("customer-data:email") &&
      names.includes("customer-data:full-name"),
    names.join(","),
  );
  check("campo public-key presente", fields.find((f) => f.name === "public-key")?.value === "pub_test_fake");
  check("firma integridad 64 hex", /^[0-9a-f]{64}$/.test(fields.find((f) => f.name === "signature:integrity")?.value ?? ""));

  // 4) Orden creada por el flujo UI + simulación demo
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).limit(1);
  check("cliente guest creado", !!user);
  const orders = user ? await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id)) : [];
  check("exactamente 1 orden", orders.length === 1, `count=${orders.length}`);
  const order = orders[0];
  if (order) {
    check("después simulación: approved", order.status === "approved", String(order.status));
    check("gateway=demo", order.gateway === "demo", String(order.gateway));
    check("gatewayStatus=approved", order.gatewayStatus === "approved", String(order.gatewayStatus));
    check("paidAt definido", order.paidAt != null);
    check("subtotal len (producto)", order.subtotal === 29900, String(order.subtotal));
    check("código FS-", order.code.startsWith("FS-"), order.code);
  }

  if (user) {
    const userOrders = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id));
    for (const o of userOrders) {
      await db.delete(schema.couponUsages).where(eq(schema.couponUsages.orderId, o.id));
      await db.delete(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
      await db.delete(schema.orders).where(eq(schema.orders.id, o.id));
    }
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  }

  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, SLUG)).limit(1);
  if (product) {
    await db.delete(schema.orderItems).where(eq(schema.orderItems.productId, product.id));
    await db.delete(schema.products).where(eq(schema.products.id, product.id));
  }

  const leftover = user
    ? await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id))
    : [];
  check("limpieza BD completa", leftover.length === 0);

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});