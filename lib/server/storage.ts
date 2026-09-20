import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";

import { serverEnv } from "@/lib/serverEnv";

const LOCAL_ROOT = path.isAbsolute(serverEnv.storageDir)
  ? serverEnv.storageDir
  : path.join(process.cwd(), serverEnv.storageDir);

const MIME_BY_EXT: Record<string, string> = {
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

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "IO_ERROR"
      | "LIMIT" = "IO_ERROR",
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export class LocalStorage {
  private root = LOCAL_ROOT;

  /** Normaliza la storageKey y devuelve la ruta absoluta bajo el root.
   *  Rechaza travesía de directorios (..), rutas absolutas y bytes nulos. */
  private resolveKey(storageKey: string): string {
    if (typeof storageKey !== "string" || storageKey.length === 0 || storageKey.length > 512) {
      throw new StorageError("storageKey inválida.", "FORBIDDEN");
    }
    if (storageKey.includes("\0")) {
      throw new StorageError("storageKey inválida.", "FORBIDDEN");
    }
    // Separo en segmentos y descarto los vacíos/`.` para normalizar de forma segura.
    const segments = storageKey.split("/").filter((s) => s.length > 0 && s !== ".");
    if (segments.length === 0 || segments.some((s) => s === "..")) {
      throw new StorageError("storageKey inválida.", "FORBIDDEN");
    }
    return path.join(this.root, ...segments);
  }

  async put(storageKey: string, data: Uint8Array): Promise<{ storageKey: string; sizeBytes: number }> {
    const absolute = this.resolveKey(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, data);
    return { storageKey, sizeBytes: data.byteLength };
  }

  async get(storageKey: string): Promise<{ data: Buffer; mimeType: string | null; sizeBytes: number }> {
    const absolute = this.resolveKey(storageKey);
    let handle;
    try {
      handle = await stat(absolute);
    } catch {
      throw new StorageError(`No existe el archivo "${storageKey}".`, "NOT_FOUND");
    }
    if (!handle.isFile()) {
      throw new StorageError(`"${storageKey}" no es un archivo regular.`, "NOT_FOUND");
    }
    const data = await readFile(absolute);
    return {
      data,
      mimeType: mimeFor(storageKey),
      sizeBytes: handle.size,
    };
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const absolute = this.resolveKey(storageKey);
      return (await stat(absolute)).isFile();
    } catch {
      return false;
    }
  }

  /** Tamaño en bytes del objeto. Lanza NOT_FOUND si no existe. */
  async stat(storageKey: string): Promise<{ sizeBytes: number }> {
    const absolute = this.resolveKey(storageKey);
    let handle;
    try {
      handle = await stat(absolute);
    } catch {
      throw new StorageError(`No existe el archivo "${storageKey}".`, "NOT_FOUND");
    }
    if (!handle.isFile()) {
      throw new StorageError(`"${storageKey}" no es un archivo regular.`, "NOT_FOUND");
    }
    return { sizeBytes: handle.size };
  }

  /** Backpressure-friendly stream para servir el archivo en route handlers.
   *  Con `range` solo lee el rango pedido (soporte de Range/206 para video, etc.). */
  stream(storageKey: string, range?: { start?: number; end?: number }): NodeJS.ReadableStream {
    const absolute = this.resolveKey(storageKey);
    const opts: { start?: number; end?: number } = {};
    if (range?.start != null) opts.start = range.start;
    if (range?.end != null) opts.end = range.end;
    const rs = Object.keys(opts).length > 0 ? createReadStream(absolute, opts) : createReadStream(absolute);
    return rs as unknown as NodeJS.ReadableStream;
  }

  /** Escribe un stream de entrada (backpressure del productor) en disco sin
   *  cargar el archivo en memoria. Opcional `maxBytes` aborta con StorageError
   *  code "LIMIT" si el stream supera el tope. La escritura es atómica: se
   *  escribe a un temporal y se renombra al destino solo al terminar bien. */
  async putStream(
    storageKey: string,
    source: NodeJS.ReadableStream,
    opts?: { maxBytes?: number },
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const absolute = this.resolveKey(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    const tmpPath = `${absolute}.${randomUUID()}.tmp`;
    let size = 0;
    let settled = false;

    try {
      await new Promise<void>((resolve, reject) => {
        const ws = createWriteStream(tmpPath);
        const counter = new Transform({
          transform(chunk: Buffer, _encoding, cb) {
            size += chunk.length;
            if (opts?.maxBytes != null && size > opts.maxBytes) {
              const err = new StorageError("Llímite de tamaño excedido.", "LIMIT");
              cb(err);
              return;
            }
            cb(null, chunk);
          },
        });

        const fail = (cause: unknown) => {
          if (settled) return;
          settled = true;
          ws.destroy();
          reject(cause);
        };
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        (source as NodeJS.ReadableStream).on("error", fail);
        counter.on("error", fail);
        ws.on("error", fail);
        ws.on("finish", finish);

        (source as NodeJS.ReadableStream).pipe(counter).pipe(ws);
      });

      await rename(tmpPath, absolute);
      return { storageKey, sizeBytes: size };
    } catch (cause) {
      await rm(tmpPath, { force: true }).catch(() => {});
      throw cause;
    }
  }

  async remove(storageKey: string): Promise<void> {
    const absolute = this.resolveKey(storageKey);
    try {
      await rm(absolute, { force: true });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
}

export function mimeFor(storageKey: string): string | null {
  const ext = storageKey.toLowerCase().split(".").pop();
  return ext ? (MIME_BY_EXT[ext] ?? null) : null;
}

export const storage = new LocalStorage();
