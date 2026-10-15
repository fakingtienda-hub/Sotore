import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { decryptSecret } from "@/lib/server/vault";
import { serverEnv } from "@/lib/serverEnv";

export type StorageDriverKind = "local" | "r2";

export type StoredStorageSettings = {
  driver: StorageDriverKind;
  /** Endpoint S3-compatible, p. ej. https://<ACCOUNT_ID>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * Fuente de verdad de la configuración de almacenamiento: BD (preferente) con
 * fallback a variables de entorno. La BD la llena el panel de administración
 * (`/admin/settings`) con las credenciales cifradas en reposo (AES-256-GCM vía
 * `lib/server/vault`). Así el comercio activa Cloudflare R2 sin tocar archivos
 * ni reiniciar el proceso.
 *
 * A diferencia de Wompi/Correo, esta configuración NO decide un valor por
 * request leyendo la BD: la lee `lib/server/storage.ts` y cachea el driver
 * resultante, porque abrir el bucket en cada subida/descarga sería caro.
 */
export const STORAGE_SETTINGS_KEY = "storage";

/** Config efectiva solo a partir del entorno. El driver remoto se elige cuando
 *  están las tres piezas (endpoint + las dos llaves); si falta alguna, local. */
export function envStorageSettings(): StoredStorageSettings {
  const { storageEndpoint, storageAccessKeyId, storageSecretAccessKey, storageBucket } = serverEnv;
  const r2Ready = !!(storageEndpoint && storageAccessKeyId && storageSecretAccessKey);
  return {
    driver: r2Ready ? "r2" : "local",
    endpoint: storageEndpoint,
    bucket: storageBucket,
    accessKeyId: storageAccessKeyId,
    secretAccessKey: storageSecretAccessKey,
  };
}

/** Config efectiva para el runtime: entorno + lo que haya en la BD (preferente).
 *  Los secretos se descifran aquí; el driver los recibe en claro solo en memoria. */
export async function loadStorageSettings(): Promise<StoredStorageSettings> {
  const out = envStorageSettings();

  try {
    const [row] = await db
      .select()
      .from(schema.storeSettings)
      .where(eq(schema.storeSettings.key, STORAGE_SETTINGS_KEY))
      .limit(1);

    if (row?.value && typeof row.value === "object") {
      const v = row.value as Record<string, unknown>;
      if (v.driver === "r2" || v.driver === "local") out.driver = v.driver;
      if (typeof v.endpoint === "string" && v.endpoint.trim()) out.endpoint = v.endpoint.trim();
      if (typeof v.bucket === "string" && v.bucket.trim()) out.bucket = v.bucket.trim();
      if (typeof v.accessKeyId === "string") {
        const dec = decryptSecret(v.accessKeyId);
        if (dec) out.accessKeyId = dec.trim();
      }
      if (typeof v.secretAccessKey === "string") {
        const dec = decryptSecret(v.secretAccessKey);
        if (dec) out.secretAccessKey = dec.trim();
      }
    }
  } catch {
    // Sin acceso a BD o fila inválida: se queda con las variables de entorno.
  }

  return out;
}

/** ¿La config puede levantar el driver remoto? Requiere endpoint + bucket + las
 *  dos llaves. Se usa tanto en runtime como en el indicador del panel. */
export function storageR2Ready(cfg: StoredStorageSettings): boolean {
  return !!(cfg.endpoint && cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey);
}
