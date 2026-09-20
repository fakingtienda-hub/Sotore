import { and, eq, isNotNull } from "drizzle-orm";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { storage } from "@/lib/server/storage";

function safeEntryName(name: string): string {
  return name.replace(/[\\/\0]/g, "_").trim();
}

/** Tipos que ya vienen comprimidos: dentro del ZIP se guardan "store" (copiados
 *  tal cual) en vez de volver a deflaterlos, que no reduce el tamaño y gasta CPU. */
function shouldStoreRaw(f: schema.ProductFile): boolean {
  const m = (f.mimeType ?? "").toLowerCase();
  if (m.startsWith("video/") || m.startsWith("audio/") || m.startsWith("image/")) return true;
  const t = (f.fileType ?? "").toLowerCase();
  return t === "video" || t === "audio" || t === "image" || t === "zip";
}

export async function buildProductPackZip(
  productId: string,
): Promise<{ ok: boolean; error?: string; sizeBytes?: number }> {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .limit(1);
  if (!product) return { ok: false, error: "El producto no existe." };

  const files = await db
    .select()
    .from(schema.productFiles)
    .where(
      and(
        eq(schema.productFiles.productId, productId),
        eq(schema.productFiles.isActive, true),
        /* El ZIP debe contener solo los archivos del curso (los que están en
           una carpeta), no las imágenes de promoción del producto. */
        isNotNull(schema.productFiles.groupId),
      ),
    )
    .orderBy(schema.productFiles.sortOrder);

  if (files.length === 0) {
    return { ok: false, error: "El producto no tiene archivos activos para comprimir." };
  }

  const groups = await db
    .select()
    .from(schema.productFileGroups)
    .where(eq(schema.productFileGroups.productId, productId))
    .orderBy(schema.productFileGroups.position);

  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));

  const sorted = [...files].sort((a, b) => {
    const ga = a.groupId ? (groupOrder.get(a.groupId) ?? groups.length) : groups.length;
    const gb = b.groupId ? (groupOrder.get(b.groupId) ?? groups.length) : groups.length;
    return ga - gb;
  });

  const tmpDir = await mkdtemp(path.join(tmpdir(), "pack-"));
  const zipPath = path.join(tmpDir, "pack.zip");
  const zipKey = `products/${productId}/pack.zip`;

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = createWriteStream(zipPath);

  const finished = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    archive.on("error", reject);
  });

  archive.pipe(output);

  for (const f of sorted) {
    const folder = f.groupId ? (groupNames.get(f.groupId) ?? null) : null;
    const entryName = folder ? `${safeEntryName(folder)}/${safeEntryName(f.name)}` : safeEntryName(f.name);
    archive.append(storage.stream(f.storageKey) as unknown as Readable, {
      name: entryName,
      store: shouldStoreRaw(f),
    });
  }

  archive.finalize();
  await finished;

  try {
    // Volcamos el ZIP a storage por streaming (los packs con videos/PDF pesan
    // mucho; no se deben cargar enteros en memoria).
    const { sizeBytes } = await storage.putStream(
      zipKey,
      createReadStream(zipPath) as unknown as NodeJS.ReadableStream,
    );
    await db
      .update(schema.products)
      .set({ zipKey, zipSizeBytes: sizeBytes, zipGeneratedAt: new Date() })
      .where(eq(schema.products.id, productId));
    return { ok: true, sizeBytes };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/** Invalida el ZIP cacheado: elimina el archivo y deja `zipKey` en null para
 *  que las próximas peticiones del pack lo regeneren bajo demanda. Se llama
 *  cada vez que cambian los archivos/carpetas del producto. */
export async function invalidateProductPackZip(productId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ zipKey: schema.products.zipKey })
      .from(schema.products)
      .where(eq(schema.products.id, productId))
      .limit(1);
    if (!row) return;
    if (row.zipKey) {
      await storage.remove(row.zipKey).catch(() => {});
    }
    await db
      .update(schema.products)
      .set({ zipKey: null, zipSizeBytes: null, zipGeneratedAt: null })
      .where(eq(schema.products.id, productId));
  } catch {
    // La invalidación es best-effort: un fallo aquí no debe romper la acción
    // principal (guardar archivos); el pack quedará stale pero regenerable.
  }
}