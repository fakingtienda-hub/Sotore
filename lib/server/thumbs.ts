import type { ProductFile } from "@/lib/db/schema";
import { storage, StorageError } from "@/lib/server/storage";

const THUMB_TARGET_HEIGHT = 400;

const inFlight = new Map<string, Promise<Buffer>>();

export type ThumbDef = {
  key: string;
  ext: "png" | "jpg";
};

export function thumbDefFor(file: Pick<ProductFile, "id" | "productId" | "mimeType" | "fileType">): ThumbDef | null {
  const mime = (file.mimeType ?? "").toLowerCase();
  if (mime === "application/pdf" || (file.fileType ?? "").toLowerCase() === "pdf") {
    return { key: `products/${file.productId}/thumbs/${file.id}.png`, ext: "png" };
  }
  if (mime.startsWith("image/") && mime !== "image/svg+xml") {
    return { key: `products/${file.productId}/thumbs/${file.id}.jpg`, ext: "jpg" };
  }
  return null;
}

let mupdfPromise: Promise<typeof import("mupdf")> | null = null;

function loadMupdf(): Promise<typeof import("mupdf")> {
  mupdfPromise ??= import("mupdf");
  return mupdfPromise;
}

export async function renderPdfThumbnail(buffer: Buffer, targetHeight: number): Promise<Buffer> {
  const mupdf = await loadMupdf();
  const doc = mupdf.Document.openDocument(new Uint8Array(buffer), "application/pdf");
  try {
    if (doc.countPages() === 0) {
      throw new Error("El PDF no tiene páginas.");
    }
    const page = doc.loadPage(0);
    try {
const bounds = page.getBounds();
    const pageHeight = bounds[3] - bounds[1];
      if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
        throw new Error("El PDF no tiene un tamaño de página válido.");
      }
      const scale = Math.min(targetHeight / pageHeight, 4);
      const matrix = mupdf.Matrix.scale(scale, scale);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, true);
      try {
        return Buffer.from(pixmap.asPNG());
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

async function renderImageThumbnail(buffer: Buffer, targetHeight: number): Promise<Buffer> {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  return sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({ height: targetHeight, width: targetHeight, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, progressive: true })
    .toBuffer();
}

async function renderThumb(file: ProductFile, def: ThumbDef): Promise<Buffer> {
  const source = await storage.get(file.storageKey);
  if (def.ext === "png") {
    return renderPdfThumbnail(source.data, THUMB_TARGET_HEIGHT);
  }
  return renderImageThumbnail(source.data, THUMB_TARGET_HEIGHT);
}

export async function getOrCreateThumb(file: ProductFile): Promise<{ data: Buffer; mimeType: string }> {
  const def = thumbDefFor(file);
  if (!def) {
    throw new Error("UNSUPPORTED");
  }

  try {
    const existing = await storage.get(def.key);
    return { data: existing.data, mimeType: existing.mimeType ?? (def.ext === "png" ? "image/png" : "image/jpeg") };
  } catch (cause) {
    if (!(cause instanceof StorageError) || cause.code !== "NOT_FOUND") {
      throw cause;
    }
  }

  let pending = inFlight.get(def.key);
  if (!pending) {
    pending = renderThumb(file, def)
      .then(async (data) => {
        await storage.put(def.key, data);
        return data;
      })
      .finally(() => {
        inFlight.delete(def.key);
      });
    inFlight.set(def.key, pending);
  }

  const data = await pending;
  return { data, mimeType: def.ext === "png" ? "image/png" : "image/jpeg" };
}