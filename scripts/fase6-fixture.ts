import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

async function main() {
  const slug = "pack-costura-pro";
  const [existing] = await db.select().from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
  const id = existing?.id ?? crypto.randomUUID();
  await db
    .insert(schema.products)
    .values({
      id,
      slug,
      title: "Pack Costura Pro",
      shortDescription: "Acceso inmediato a los 12 patrones\nActualizaciones de por vida\nGrupo privado de soporte",
      description: "El pack definitivo de costura para crear tus propias prendas desde cero.",
      price: 29900,
      compareAtPrice: 42900,
      currency: "COP",
      status: "published",
      tags: ["costura", "patrones"],
      publishedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.products.slug,
      set: { status: "published", price: 29900, compareAtPrice: 42900, publishedAt: new Date(), title: "Pack Costura Pro" },
    });
  console.log("product-uuid", id);

  const [existingCoupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, "WELCOME10")).limit(1);
  if (!existingCoupon) {
    await db.insert(schema.coupons).values({
      code: "WELCOME10",
      type: "percentage",
      value: 10,
      maxUses: 50,
      usedCount: 0,
      status: "active",
    });
    console.log("coupon WELCOME10 creado");
  } else {
    console.log("coupon WELCOME10 ya existe");
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});