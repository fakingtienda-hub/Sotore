import Busboy from "@fastify/busboy";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";

import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { createFileTypeSniff, FileTypeMismatchError } from "@/lib/server/file-sniff";
import { mimeFor, storage, StorageError } from "@/lib/server/storage";
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

  const contentType = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;/i.test(contentType)) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const body = req.body;
  if (!body) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  // Parseo multipart en streaming: el archivo se vuelca a disco sin pasar por
  // memoria (las variables `resp` de resultados vienen de putStream), mientras
  // el body del request se consume poco a poco. Esto evita los picos de RAM
  // de `req.formData()` + `file.arrayBuffer()` con videos grandes.
  const bb = Busboy({
    headers: { "content-type": contentType },
    limits: { files: 1, fields: 8, fieldSize: 256 },
  });

  type Outcome =
    | { kind: "ok"; storageKey: string; mimeType: string; sizeBytes: number }
    | { kind: "error"; status: number; message: string };

  const outcome = new Promise<Outcome>((resolveOutcome) => {
    let productId = "";
    let parsed = false;

    bb.on("field", (name, value) => {
      if (name === "productId") productId = value.trim();
    });

    bb.on("file", (name, stream, filename, _encoding, mimeType) => {
      if (name !== "file" || parsed) {
        stream.resume();
        return;
      }
      parsed = true;

      if (!PRODUCT_UUID.test(productId)) {
        stream.resume();
        resolveOutcome({ kind: "error", status: 400, message: "productId inválido." });
        return;
      }

      const safeName = sanitizeFileName(filename);
      const storageKey = `products/${productId}/${randomUUID()}-${safeName}`;
      const ext = path.extname(safeName).toLowerCase().replace(/^\./, "");

      // Valida por firma de contenido (magic bytes) que el archivo no esté
      // disfrazado con otra extensión. El stream se inspecciona al vuelo sin
      // cargar el archivo en memoria.
      const sniff = createFileTypeSniff(ext) as unknown as NodeJS.ReadableStream;
      stream.pipe(sniff as never);
      stream.on("error", (e: unknown) => {
        (sniff as unknown as import("node:stream").Transform).destroy(e as Error);
      });

      storage
        .putStream(storageKey, sniff, { maxBytes: serverEnv.maxUploadBytes })
        .then((r) => {
          resolveOutcome({
            kind: "ok",
            storageKey: r.storageKey,
            mimeType: mimeType || mimeFor(r.storageKey) || "application/octet-stream",
            sizeBytes: r.sizeBytes,
          });
        })
        .catch((cause) => {
          if (cause instanceof FileTypeMismatchError) {
            resolveOutcome({ kind: "error", status: 400, message: cause.message });
          } else if (cause instanceof StorageError && cause.code === "LIMIT") {
            resolveOutcome({
              kind: "error",
              status: 413,
              message: `El archivo supera el límite de ${Math.round(serverEnv.maxUploadBytes / 1024 / 1024)} MB.`,
            });
          } else {
            resolveOutcome({ kind: "error", status: 500, message: "Error al escribir el archivo." });
          }
        });
    });

    bb.on("close", () => {
      resolveOutcome({ kind: "error", status: 400, message: "Falta el archivo." });
    });
    bb.on("error", () => {
      resolveOutcome({ kind: "error", status: 400, message: "Body inválido." });
    });

    Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream).pipe(bb as never);
  });

  const result = await outcome;
  if (result.kind === "error") {
    bb.destroy();
    return Response.json({ error: result.message }, { status: result.status });
  }

  return Response.json({
    ok: true,
    storageKey: result.storageKey,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
  });
}