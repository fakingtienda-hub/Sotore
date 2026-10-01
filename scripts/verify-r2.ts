/** Prueba aislada del driver R2 sin tocar la base de datos ni el catálogo.
 *
 *  Escribe un objeto temporal, lo lee, lo stream-ea con rango, lo borra y
 *  comprueba el 404 de un objeto inexistente. Requiere credenciales reales en
 *  STORAGE_ENDPOINT / STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY.
 *
 *  Uso:  npx tsx --conditions=react-server scripts/verify-r2.ts [bucket] */
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { R2Storage } from "@/lib/server/storage-r2";
import { StorageError } from "@/lib/server/storage-driver";
import { serverEnv } from "@/lib/serverEnv";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function main() {
  const endpoint = serverEnv.storageEndpoint;
  const accessKeyId = serverEnv.storageAccessKeyId;
  const secretAccessKey = serverEnv.storageSecretAccessKey;
  const bucket = process.argv[2] ?? serverEnv.storageBucket;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error(
      "Faltan STORAGE_ENDPOINT / STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY en .env.local",
    );
    process.exit(1);
  }

  const storage = new R2Storage({ endpoint, accessKeyId, secretAccessKey, bucket });
  const prefix = `tmp/selftest-${randomUUID()}`;
  const key = `${prefix}/sample.bin`;
  const payload = Buffer.from(
    Array.from({ length: 256 * 1024 }, (_, i) => i % 251),
  );
  const sha = createHash("sha256").update(payload).digest("hex");

  console.log(`Bucket: ${bucket}\nKey:    ${key}\n`);

  try {
    // --- put (buffer) ------------------------------------------------------
    console.log("Escritura");
    const put = await storage.put(key, payload);
    check("put devuelve el tamaño exacto", put.sizeBytes === payload.length, `${put.sizeBytes}`);
    check("exists() da true tras put", await storage.exists(key));

    // --- get ---------------------------------------------------------------
    console.log("\nLectura");
    const got = await storage.get(key);
    check("get devuelve los mismos bytes", createHash("sha256").update(got.data).digest("hex") === sha);
    check("get resuelve un MIME", typeof got.mimeType === "string" || got.mimeType === null, String(got.mimeType));

    // --- stat --------------------------------------------------------------
    console.log("\nMetadata");
    const meta = await storage.stat(key);
    check("stat devuelve sizeBytes", meta.sizeBytes === payload.length, `${meta.sizeBytes}`);

    // --- stream completo ---------------------------------------------------
    console.log("\nStreaming");
    const full = await readAll(await storage.stream(key));
    check("stream() completo coincide con put", full.length === payload.length && full.equals(payload));

    // --- stream con rango --------------------------------------------------
    const ranged = await readAll(await storage.stream(key, { start: 1000, end: 1999 }));
    check(
      "stream() con rango devuelve solo los bytes pedidos",
      ranged.length === 1000 && ranged.equals(payload.subarray(1000, 2000)),
      `recibidos ${ranged.length}`,
    );

    // --- putStream (multipart, escribe desde disco) -----------------------
    console.log("\nStreaming de entrada");
    const big = Buffer.alloc(12 * 1024 * 1024, 7);
    const streamKey = `${prefix}/streamed.bin`;
    const streamed = await storage.putStream(
      streamKey,
      Readable.from([big]) as unknown as NodeJS.ReadableStream,
    );
    check("putStream reporta el tamaño", streamed.sizeBytes === big.length, `${streamed.sizeBytes}`);
    const streamedBack = await storage.get(streamKey);
    check("putStream sube los bytes íntegros", streamedBack.data.equals(big));

    // --- límite de tamaño --------------------------------------------------
    const limitKey = `${prefix}/limited.bin`;
    let limitCode: string | null = null;
    try {
      await storage.putStream(
        limitKey,
        Readable.from([Buffer.alloc(1024)]) as unknown as NodeJS.ReadableStream,
        { maxBytes: 512 },
      );
    } catch (cause) {
      limitCode = cause instanceof StorageError ? cause.code : null;
    }
    check("putStream aborta con code LIMIT", limitCode === "LIMIT", String(limitCode));

    // --- signedUrl ---------------------------------------------------------
    console.log("\nDescarga firmada");
    const signed = await storage.signedUrl(key, { expiresInSeconds: 300, downloadName: "sample.bin" });
    check("signedUrl devuelve una URL", typeof signed === "string" && signed.length > 0);
    if (typeof signed === "string") {
      const res = await fetch(signed);
      const body = Buffer.from(await res.arrayBuffer());
      check("la URL firmada descarga el objeto", res.ok, `status ${res.status}`);
      check("respeta Content-Disposition", (res.headers.get("content-disposition") ?? "").includes("attachment"), res.headers.get("content-disposition") ?? "(vacío)");
      check("los bytes firmados coinciden", body.equals(payload), `${body.length} bytes`);
    }

    // --- remove ------------------------------------------------------------
    console.log("\nBorrado");
    await storage.remove(key);
    check("exists() da false tras remove", !(await storage.exists(key)));

    // --- 404 ---------------------------------------------------------------
    const missing = `${prefix}/no-existe.bin`;
    let missingCode: string | null = null;
    try {
      await storage.stat(missing);
    } catch (cause) {
      missingCode = cause instanceof StorageError ? cause.code : null;
    }
    check("stat de un objeto ausente da NOT_FOUND", missingCode === "NOT_FOUND", String(missingCode));

    let streamMissingCode: string | null = null;
    try {
      await storage.stream(missing);
    } catch (cause) {
      streamMissingCode = cause instanceof StorageError ? cause.code : null;
    }
    check("stream de un objeto ausente da NOT_FOUND", streamMissingCode === "NOT_FOUND", String(streamMissingCode));

    check("exists() de un objeto ausente da false (sin lanzar)", (await storage.exists(missing)) === false);

    // --- recorrido de directorios -----------------------------------------
    let traversal: string | null = null;
    try {
      await storage.get(`${prefix}/../../etc/passwd`);
    } catch (cause) {
      traversal = cause instanceof StorageError ? cause.code : null;
    }
    check("rechaza travesía de directorios", traversal === "FORBIDDEN", String(traversal));

    await storage.remove(streamKey).catch(() => {});
  } finally {
    await storage.remove(key).catch(() => {});
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
