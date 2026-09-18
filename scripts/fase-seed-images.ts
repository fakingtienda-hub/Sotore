import { config } from "dotenv";

config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

/**
 * Enlaza portadas locales de los productos de prueba.
 * Idempotente: setea coverImageUrl = /api/files/products/{slug}/cover-1.jpg
 * y publica kit-herramientas-negocio (estaba draft) para que los 3 se vean.
 */

const COVERS: Array<{ slug: string; status: "draft" | "published" | "archived" }> = [
  { slug: "pack-moldes-basicos", status: "published" },
  { slug: "curso-costura-creativa", status: "published" },
  { slug: "kit-herramientas-negocio", status: "published" },
  { slug: "pack-costura-pro", status: "published" },
  { slug: "curso-amigurumis", status: "published" },
  { slug: "curso-crochet-basico", status: "published" },
];

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fakingstore";
  const queryClient = postgres(databaseUrl, { prepare: false });
  const db = drizzle(queryClient, { schema, casing: "snake_case" });

  let updated = 0;
  for (const cover of COVERS) {
    const [existing] = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.slug, cover.slug))
      .limit(1);
    if (!existing) {
      console.log(`  no existe producto con slug: ${cover.slug}`);
      continue;
    }
    await db
      .update(schema.products)
      .set({
        coverImageUrl: `/api/files/products/${cover.slug}/cover-1.jpg`,
        status: cover.status,
        publishedAt: cover.status === "published" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.products.id, existing.id));
    updated++;
    console.log(`  portada: ${cover.slug}`);
  }
  console.log(`Productos con portada: ${updated}`);
  await queryClient.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });