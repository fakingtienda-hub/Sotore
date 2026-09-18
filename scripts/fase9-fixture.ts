import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

const databaseUrl = process.env.DATABASE_URL!;
const storageDir = process.env.STORAGE_DIR ?? "storage";
const queryClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(queryClient, { schema, casing: "snake_case" });

const SLUG = "pack-costura-pro";

async function main() {
  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, SLUG)).limit(1);
  if (!product) {
    throw new Error(`Producto ${SLUG} no existe. Ejecuta scripts/fase6-fixture.ts primero.`);
  }

  // Ensure product is published
  if (product.status !== "published") {
    await db.update(schema.products).set({ status: "published", publishedAt: new Date() }).where(eq(schema.products.id, product.id));
    console.log(`producto ${SLUG} marcado como published`);
  }

  // Ensure a product file exists
  const [existingFile] = await db
    .select()
    .from(schema.productFiles)
    .where(eq(schema.productFiles.productId, product.id))
    .limit(1);

  if (!existingFile) {
    const storageKey = `products/${product.id}/demo-patron.pdf`;
    const filePath = path.join(storageDir, storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from("PDF demo content — fase 9 test file.\n".repeat(10)));

    const result = await db
      .insert(schema.productFiles)
      .values({
        productId: product.id,
        name: "demo-patron.pdf",
        description: "Patrón de prueba (fase 9)",
        fileType: "pdf",
        mimeType: "application/pdf",
        sizeBytes: Buffer.byteLength("PDF demo content — fase 9 test file.\n".repeat(10)),
        storageKey,
        storageProvider: "local",
        sortOrder: 0,
        isActive: true,
      })
      .returning({ id: schema.productFiles.id });

    console.log(`product_file creado: ${result[0]?.id} → ${storageKey}`);
  } else {
    console.log(`product_file ya existe: ${existingFile.id}`);
  }

  console.log("fixture fase9 OK");
  await queryClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
