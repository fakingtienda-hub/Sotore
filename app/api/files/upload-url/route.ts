import { randomUUID } from "node:crypto";
import path from "node:path";

import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { mimeFor, storage } from "@/lib/server/storage";
import { serverEnv } from "@/lib/serverEnv";

/** Firma de URL de subida directa al bucket. Contraparte de `POST /api/files/upload`,
 *  que sigue existiendo para cuando el driver es local.
 *
 *  Por qué existe: Vercel corta el body de una request en ~4,5 MB, así que un
 *  pack de cientos de MB no puede atravesar la función. Con una URL firmada el
 *  navegador hace el PUT contra R2 y los bytes nunca tocan el serverless.
 *
 *  Consecuencia de seguridad que hay que tener presente: al no pasar los bytes
 *  por la app, aquí NO se puede validar la firma del contenido (magic bytes)
 *  como sí hace `createFileTypeSniff` en la ruta proxied. A cambio se fija el
 *  `Content-Type` a partir de la extensión y no del `Content-Type` declarado por
 *  el cliente, y ese valor viaja dentro de la firma: si no coincide, el propio
 *  bucket rechaza el PUT. El contenido se sirve después por `/api/files/...`,
 *  que aplica `media-policy` y baja SVG/HTML/JS como adjunto. */
const PRODUCT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRESIGN_TTL_SECONDS = 900;

function sanitizeFileName(name: string, maxLength = 80): string {
  const base = path.basename(name).replace(/\s+/g, "-");
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, maxLength);
  return safe || "archivo";
}

type Body = { productId?: unknown; filename?: unknown; sizeBytes?: unknown };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!PRODUCT_UUID.test(productId)) {
    return Response.json({ error: "productId inválido." }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename : "";
  const sizeBytes = Number(body.sizeBytes);
  if (!filename.trim() || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return Response.json({ error: "Faltan datos del archivo." }, { status: 400 });
  }
  if (sizeBytes > serverEnv.maxUploadBytes) {
    return Response.json(
      { error: `El archivo supera el límite de ${Math.round(serverEnv.maxUploadBytes / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  const safeName = sanitizeFileName(filename);
  const storageKey = `products/${productId}/${randomUUID()}-${safeName}`;

  // El tipo sale de la extensión, nunca del `Content-Type` que declara el
  // navegador: es el dato que no controla el cliente de verdad.
  const mimeType = mimeFor(safeName);
  if (!mimeType) {
    return Response.json({ error: "Tipo de archivo no permitido." }, { status: 400 });
  }

  const url = await storage.presignPut(storageKey, {
    expiresInSeconds: PRESIGN_TTL_SECONDS,
    contentType: mimeType,
    contentLength: sizeBytes,
  });

  if (!url) {
    // Driver local: no hay bucket al que presignarle. El cliente cae a la
    // subida proxied por la app, que funciona mientras el fs sea escribible.
    return Response.json(
      { error: "Subida directa no disponible; usar la ruta proxied." },
      { status: 501 },
    );
  }

  return Response.json({
    ok: true,
    url,
    method: "PUT",
    storageKey,
    mimeType,
    sizeBytes,
    headers: { "Content-Type": mimeType },
  });
}
