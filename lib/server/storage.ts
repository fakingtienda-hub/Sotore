import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";

import { serverEnv } from "@/lib/serverEnv";
import {
  mimeFor,
  normalizeObjectKey,
  StorageError,
  type GetResult,
  type PutResult,
  type StorageDriver,
  type StorageRange,
} from "@/lib/server/storage-driver";
import { createR2Storage } from "@/lib/server/storage-r2";

export class LocalStorage implements StorageDriver {
  readonly kind = "local" as const;

  /** Se resuelve en el primer uso, no al construir el driver: `next build`
   *  importa esta módulo para recoger page data y no debe leer el entorno. */
  private rootCache: string | null = null;

  private get root(): string {
    this.rootCache ??= path.isAbsolute(serverEnv.storageDir)
      ? serverEnv.storageDir
      : path.join(/*turbopackIgnore: true*/ process.cwd(), serverEnv.storageDir);
    return this.rootCache;
  }

  /** Normaliza la storageKey y devuelve la ruta absoluta bajo el root.
   *  Rechaza travesía de directorios (..), rutas absolutas y bytes nulos. */
  private resolveKey(storageKey: string): string {
    const key = normalizeObjectKey(storageKey);
    return path.join(this.root, ...key.split("/"));
  }

  async put(storageKey: string, data: Uint8Array): Promise<PutResult> {
    const absolute = this.resolveKey(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, data);
    return { storageKey, sizeBytes: data.byteLength };
  }

  async get(storageKey: string): Promise<GetResult> {
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
   *  Con `range` solo lee el rango pedido (soporte de Range/206 para video, etc.).
   *  Asíncrono por contrato común con el driver remoto, aunque aquí no await. */
  async stream(storageKey: string, range?: StorageRange): Promise<NodeJS.ReadableStream> {
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
  ): Promise<PutResult> {
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

  /** El driver local no sirve URLs firmadas: el bucket no existe. Los route
   *  handlers interpretan `null` y hacen streaming a través de la función. */
  async signedUrl(): Promise<string | null> {
    return null;
  }
}

/* Driver activo. Con STORAGE_ENDPOINT + credenciales en el entorno usa R2; si
 * no, cae al filesystem local para que el desarrollo siga funcionando. */
function selectStorage(): StorageDriver {
  const r2 = createR2Storage();
  if (r2) return r2;
  return new LocalStorage();
}

let storageInstance: StorageDriver | null = null;

function storageDriver(): StorageDriver {
  storageInstance ??= selectStorage();
  return storageInstance;
}

/** El driver se elige en el primer uso. `next build` importa esta módulo para
 *  recoger page data; elegirlo aquí exigiría el entorno de storage en build. */
export const storage: StorageDriver = new Proxy({} as StorageDriver, {
  get(_target, prop, receiver) {
    return Reflect.get(storageDriver(), prop, receiver);
  },
});

export { StorageError, mimeFor };
export type { StorageDriver, GetResult, PutResult, StorageRange };
