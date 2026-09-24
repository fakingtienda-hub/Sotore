import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { decryptSecret } from "@/lib/server/vault";
import { serverEnv } from "@/lib/serverEnv";

export type StoredWompiSettings = {
  env: "sandbox" | "production";
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
};

/**
 * Fuente de verdad de la configuración de Wompi: BD (preferente) con
 * fallback a variables de entorno. La BD la llena el panel de administración
 * (secretos cifrados con AES-256-GCM). Así el comercio configura Wompi sin
 * tocar archivos ni reiniciar el proceso.
 */
export const WOMPI_SETTINGS_KEY = "wompi";

export async function loadWompiSettings(): Promise<StoredWompiSettings> {
  let env: "sandbox" | "production" = serverEnv.wompiEnv;
  let publicKey = serverEnv.wompiPublicKey;
  let integritySecret = serverEnv.wompiIntegritySecret;
  let eventsSecret = serverEnv.wompiEventsSecret;

  try {
    const [row] = await db
      .select()
      .from(schema.storeSettings)
      .where(eq(schema.storeSettings.key, WOMPI_SETTINGS_KEY))
      .limit(1);

    if (row?.value && typeof row.value === "object") {
      const v = row.value as Record<string, unknown>;
      if (v.env === "sandbox" || v.env === "production") env = v.env;
      if (typeof v.publicKey === "string" && v.publicKey.trim()) publicKey = v.publicKey.trim();
      if (typeof v.integritySecret === "string") {
        const dec = decryptSecret(v.integritySecret);
        if (dec) integritySecret = dec;
      }
      if (typeof v.eventsSecret === "string") {
        const dec = decryptSecret(v.eventsSecret);
        if (dec) eventsSecret = dec;
      }
    }
  } catch {
    // Sin acceso a BD o fila inválida: se queda con las variables de entorno.
  }

  return { env, publicKey, integritySecret, eventsSecret };
}