/** Lista el contenido del bucket para ver qué objetos hay y con qué nombre.
 *
 *  Uso:  npx tsx --conditions=react-server scripts/list-r2-objects.ts [prefijo] */
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { createR2Storage } from "@/lib/server/storage-r2";

function human(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

async function main() {
  const prefix = process.argv[2];
  const storage = createR2Storage();
  if (!storage) {
    console.error("Faltan credenciales STORAGE_* en el entorno.");
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
    },
  });
  const bucket = process.env.STORAGE_BUCKET!;

  let token: string | undefined;
  let total = 0;
  let objects = 0;

  console.log(`Bucket: ${bucket}\n${prefix ? `Prefijo: ${prefix}\n` : ""}`);

  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) {
      objects++;
      total += obj.Size ?? 0;
      console.log(`  ${String(obj.Size ?? 0).padStart(13)}  ${human(obj.Size ?? 0).padStart(9)}  ${obj.Key}`);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  console.log(`\n${objects} objetos, ${human(total)} en total`);
  void storage;
}

void main();
