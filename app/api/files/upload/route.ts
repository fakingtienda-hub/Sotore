import { randomUUID } from "node:crypto";
import path from "node:path";

import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { mimeFor, storage } from "@/lib/server/storage";
import { serverEnv } from "@/lib/serverEnv";

const PRODUCT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFileName(name: string, maxLength = 80): string {
  const base = path.basename(name).replace(/\s+/g, "-");
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, maxLength);
  return safe || "archivo";
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const productId = String(formData.get("productId") ?? "");
  if (!PRODUCT_UUID.test(productId)) {
    return Response.json({ error: "productId inválido." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo." }, { status: 400 });
  }
  if (file.size > serverEnv.maxUploadBytes) {
    return Response.json(
      { error: `El archivo supera el límite de ${Math.round(serverEnv.maxUploadBytes / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  const safeName = sanitizeFileName(file.name);
  const storageKey = `products/${productId}/${randomUUID()}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  await storage.put(storageKey, bytes);

  return Response.json({
    ok: true,
    storageKey,
    mimeType: file.type || mimeFor(storageKey),
    sizeBytes: file.size,
  });
}