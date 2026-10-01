import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable, Transform } from "node:stream";

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

/** R2 no usa regiones reales: el endpoint espera literalmente `auto`. */
const R2_REGION = "auto";

function isNotFound(cause: unknown): boolean {
  const err = cause as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (err?.name === "NoSuchKey" || err?.name === "NotFound") return true;
  return err?.$metadata?.httpStatusCode === 404;
}

/** Convierte el body que devuelve el SDK en un Readable de Node.
 *
 *  No se puede usar `Readable.fromWeb` de forma directa: con validación de
 *  checksum activa, el SDK devuelve su propia clase `ChecksumStream`, que no es
 *  una instancia de `ReadableStream` de `node:stream/web` y `fromWeb` la
 *  rechaza con ERR_INVALID_ARG_TYPE. Se recorre el body con su iterador asíncrono
 *  (o su reader si no lo trae) y se reemite como Readable de Node, manteniendo
 *  el streaming: nunca se carga el objeto entero en memoria. */
async function* iterateBody(body: unknown): AsyncGenerator<Buffer> {
  const source = body as {
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
    getReader?: () => ReadableStreamDefaultReader<Uint8Array>;
  };

  if (typeof source?.[Symbol.asyncIterator] === "function") {
    for await (const chunk of source as AsyncIterable<unknown>) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    }
    return;
  }

  if (typeof source?.getReader === "function") {
    const reader = source.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield Buffer.from(value);
    }
  }
}

function rangeHeader(range?: StorageRange): string | undefined {
  if (range?.start == null) return undefined;
  const end = range.end != null ? range.end : "";
  return `bytes=${range.start}-${end}`;
}

/** Driver S3-compatible para Cloudflare R2 (compatible con S3 v3).
 *
 *  Dos diferencias prácticas frente al driver local:
 *  - Nada se sirve proxyado: los packs de cientos de MB se entregan con
 *    `signedUrl()` para que el navegador baje directo del bucket. R2 no cobra
 *    por salida a internet, así que esto no encarece la descarga.
 *  - Las escrituras grandes usan multipart (`Upload`) en vez de `PutObject`,
 *    porque un único PUT está limitado a 5 GiB y fallaría sin `content-length`. */
export class R2Storage implements StorageDriver {
  readonly kind = "r2" as const;
  private client: S3Client;
  private bucket: string;

  constructor(opts: { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string }) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: R2_REGION,
      endpoint: opts.endpoint,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    });
  }

  async put(storageKey: string, data: Uint8Array): Promise<PutResult> {
    const key = normalizeObjectKey(storageKey);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: mimeFor(key) ?? undefined,
        }),
      );
      return { storageKey, sizeBytes: data.byteLength };
    } catch (cause) {
      throw this.mapError(cause, key);
    }
  }

  async get(storageKey: string): Promise<GetResult> {
    const key = normalizeObjectKey(storageKey);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const data = Buffer.from(await res.Body!.transformToByteArray());
      return {
        data,
        mimeType: res.ContentType ?? mimeFor(key),
        sizeBytes: data.byteLength,
      };
    } catch (cause) {
      throw this.mapError(cause, key);
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const key = normalizeObjectKey(storageKey);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (cause) {
      if (isNotFound(cause)) return false;
      throw this.mapError(cause, key);
    }
  }

  async stat(storageKey: string): Promise<{ sizeBytes: number }> {
    const key = normalizeObjectKey(storageKey);
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (res.ContentLength == null) {
        throw new StorageError(`No se pudo leer el tamaño de "${storageKey}".`, "IO_ERROR");
      }
      return { sizeBytes: res.ContentLength };
    } catch (cause) {
      if (cause instanceof StorageError) throw cause;
      throw this.mapError(cause, key);
    }
  }

  /** Asíncrono por naturaleza: el 404 de un objeto ausente solo se conoce
   *  cuando la petición a R2 resuelve, no al momento de construir el stream. */
  async stream(storageKey: string, range?: StorageRange): Promise<NodeJS.ReadableStream> {
    const key = normalizeObjectKey(storageKey);
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: rangeHeader(range),
        }),
      );
      if (!res.Body) {
        throw new StorageError(`El objeto "${storageKey}" llegó vacío.`, "IO_ERROR");
      }
      return Readable.from(iterateBody(res.Body)) as unknown as NodeJS.ReadableStream;
    } catch (cause) {
      throw this.mapError(cause, key);
    }
  }

  async putStream(
    storageKey: string,
    source: NodeJS.ReadableStream,
    opts?: { maxBytes?: number },
  ): Promise<PutResult> {
    const key = normalizeObjectKey(storageKey);
    let size = 0;

    let body: NodeJS.ReadableStream = source;
    if (opts?.maxBytes != null) {
      const max = opts.maxBytes;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, cb) {
          size += chunk.length;
          if (size > max) {
            cb(new StorageError("Llímite de tamaño excedido.", "LIMIT"));
            return;
          }
          cb(null, chunk);
        },
      });
      source.pipe(counter);
      body = counter;
    } else {
      body.on("data", (chunk: Buffer | string) => {
        size += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      });
    }

    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: body as Readable,
          ContentType: mimeFor(key) ?? undefined,
        },
      });
      await upload.done();
      return { storageKey, sizeBytes: size };
    } catch (cause) {
      if (cause instanceof StorageError) throw cause;
      throw this.mapError(cause, key);
    }
  }

  async remove(storageKey: string): Promise<void> {
    const key = normalizeObjectKey(storageKey);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (cause) {
      if (isNotFound(cause)) return;
      throw this.mapError(cause, key);
    }
  }

  async signedUrl(
    storageKey: string,
    opts?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string | null> {
    const key = normalizeObjectKey(storageKey);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: opts?.downloadName
        ? `attachment; filename="${opts.downloadName.replace(/[^\w.\- ]/g, "_")}"`
        : undefined,
    });
    try {
      return await getSignedUrl(this.client, command, {
        expiresIn: opts?.expiresInSeconds ?? 900,
      });
    } catch (cause) {
      throw this.mapError(cause, key);
    }
  }

  /** Firma un PUT para que el navegador suba directo al bucket. `contentLength`
   *  va en la firma para que R2 rechace de entrada un archivo más grande del
   *  declarado, en vez de dejar que se suba entero y se detecte tarde. */
  async presignPut(
    storageKey: string,
    opts?: { expiresInSeconds?: number; contentType?: string; contentLength?: number },
  ): Promise<string | null> {
    const key = normalizeObjectKey(storageKey);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts?.contentType,
      ContentLength: opts?.contentLength,
    });
    try {
      return await getSignedUrl(this.client, command, {
        expiresIn: opts?.expiresInSeconds ?? 900,
      });
    } catch (cause) {
      throw this.mapError(cause, key);
    }
  }

  private mapError(cause: unknown, key: string): StorageError {
    if (cause instanceof StorageError) return cause;
    if (isNotFound(cause)) {
      return new StorageError(`No existe el archivo "${key}".`, "NOT_FOUND");
    }
    return new StorageError(`Error de storage en "${key}": ${String(cause)}`, "IO_ERROR");
  }
}

export function createR2Storage(): R2Storage | null {
  const { storageEndpoint, storageAccessKeyId, storageSecretAccessKey, storageBucket } = serverEnv;
  if (!storageEndpoint || !storageAccessKeyId || !storageSecretAccessKey) return null;
  return new R2Storage({
    endpoint: storageEndpoint,
    accessKeyId: storageAccessKeyId,
    secretAccessKey: storageSecretAccessKey,
    bucket: storageBucket,
  });
}
