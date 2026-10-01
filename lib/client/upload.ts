/**
 * Subida de archivos al storage, eligiendo la vía más barata por separado.
 *
 *   1. `POST /api/files/upload-url` pide una URL firmada y el navegador hace el
 *      PUT directo contra el bucket. Los bytes no atraviesan la función, así que
 *      no hay límite de ~4,5 MB de Vercel ni consumo de RAM del serverless.
 *   2. Si el storage es local (desarrollo, o R2 sin configurar) el endpoint
 *      responde 501 y caemos a `POST /api/files/upload`, que sí funciona con el
 *      filesystem escribible.
 *
 * Ambos caminos devuelven la misma forma, así que quien llama no necesita saber
 * por dónde fue el archivo.
 */

export type UploadedFile = { storageKey: string; mimeType: string | null; sizeBytes: number | null };

type UploadUrlResponse = {
  ok?: boolean;
  url?: string;
  storageKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  headers?: Record<string, string>;
  error?: string;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function uploadViaProxy(productId: string, file: File): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append("productId", productId);
  fd.append("file", file);
  const res = await fetch("/api/files/upload", { method: "POST", body: fd });
  const json = (await readJson(res)) as { storageKey?: string; mimeType?: string; sizeBytes?: number; error?: string };
  if (!res.ok || !json.storageKey) {
    throw new Error(json.error ?? "Error al subir el archivo.");
  }
  return { storageKey: json.storageKey, mimeType: json.mimeType ?? null, sizeBytes: json.sizeBytes ?? null };
}

export async function uploadFile(productId: string, file: File): Promise<UploadedFile> {
  const res = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, filename: file.name, sizeBytes: file.size }),
  });

  // 501 = no hay bucket al que presignar. Es el cue para usar la ruta proxied,
  // no un error que haya que mostrarle al usuario.
  if (res.status === 501) return uploadViaProxy(productId, file);

  const json = (await readJson(res)) as UploadUrlResponse;
  if (!res.ok || !json.ok || !json.url || !json.storageKey) {
    throw new Error(json.error ?? "Error al subir el archivo.");
  }

  const put = await fetch(json.url, {
    method: "PUT",
    headers: json.headers ?? { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) {
    throw new Error(
      `El almacenamiento rechazó el archivo (${put.status}). Si es un archivo grande, revisá el CORS del bucket.`,
    );
  }

  return {
    storageKey: json.storageKey,
    mimeType: json.mimeType ?? file.type ?? null,
    sizeBytes: json.sizeBytes ?? file.size,
  };
}
