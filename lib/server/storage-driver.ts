/** Contrato común de los drivers de storage (local en disco y R2/S3).
 *
 *  Nota sobre `stream`: es asíncrono a propósito. Con el driver local se
 *  puede abrir el archivo de forma síncrona, pero en R2 el `GetObject` es una
 *  llamada de red: el objeto puede no existir y ese error solo se conoce cuando
 *  la petición resuelve. Por eso los route handlers hacen `await storage.stream()`
 *  y capturan `StorageError` con `code === "NOT_FOUND"`. */

export type StorageRange = { start?: number; end?: number };

export type PutResult = { storageKey: string; sizeBytes: number };

export type GetResult = {
  data: Buffer;
  mimeType: string | null;
  sizeBytes: number;
};

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "IO_ERROR" | "LIMIT" = "IO_ERROR",
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export interface StorageDriver {
  /** `local` = filesystem del servidor, `r2` = bucket remoto S3-compatible.
   *  Los drivers remotos no deben borrarse desde la app (ver `pack.ts`). */
  readonly kind: "local" | "r2";

  put(storageKey: string, data: Uint8Array): Promise<PutResult>;

  get(storageKey: string): Promise<GetResult>;

  exists(storageKey: string): Promise<boolean>;

  stat(storageKey: string): Promise<{ sizeBytes: number }>;

  stream(storageKey: string, range?: StorageRange): Promise<NodeJS.ReadableStream>;

  /** Escribe un stream de entrada sin cargarlo entero en memoria. `maxBytes`
   *  aborta con `StorageError` code "LIMIT" si el stream supera el tope. */
  putStream(
    storageKey: string,
    source: NodeJS.ReadableStream,
    opts?: { maxBytes?: number },
  ): Promise<PutResult>;

  remove(storageKey: string): Promise<void>;

  /** URL firmada de descarga directa. Solo la implementan los drivers remotos:
   *  permite que el navegador baje el objeto sin pasar los bytes por la función
   *  de Vercel (imprescindible para packs de cientos de MB). `null` en local. */
  signedUrl(
    storageKey: string,
    opts?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string | null>;
}

/** Normaliza una storageKey para uso remoto: rechaza travesía de directorios,
 *  bytes nulos y rutas vacías. Igual criterio que el driver local, pero sin
 *  resolver contra un filesystem (en S3 la clave es plana, no una ruta). */
export function normalizeObjectKey(storageKey: string): string {
  if (typeof storageKey !== "string" || storageKey.length === 0 || storageKey.length > 512) {
    throw new StorageError("storageKey inválida.", "FORBIDDEN");
  }
  if (storageKey.includes("\0")) {
    throw new StorageError("storageKey inválida.", "FORBIDDEN");
  }
  const segments = storageKey.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segments.length === 0 || segments.some((s) => s === "..")) {
    throw new StorageError("storageKey inválida.", "FORBIDDEN");
  }
  return segments.join("/");
}

export const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  md: "text/markdown",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function mimeFor(storageKey: string): string | null {
  const ext = storageKey.toLowerCase().split(".").pop();
  return ext ? (MIME_BY_EXT[ext] ?? null) : null;
}
