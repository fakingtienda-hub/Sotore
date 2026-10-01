import { config } from "dotenv";

void config({ path: ".env.local" });

export type ServerEnv = {
  appUrl: string;
  databaseUrl: string;
  databasePoolMax: number;
  authSecret: string;
  emailProvider: "console" | "resend" | "smtp";
  emailApiKey: string;
  emailFrom: string;
  isProd: boolean;
  storageDir: string;
  storageBaseUrl: string;
  maxUploadBytes: number;
  storageBucket: string;
  storageEndpoint: string;
  storageAccessKeyId: string;
  storageSecretAccessKey: string;
  signedUrlTtlSeconds: number;
  wompiEnv: "sandbox" | "production";
  wompiPublicKey: string;
  wompiIntegritySecret: string;
  wompiEventsSecret: string;
  wompiApiUrl: string;
  reconcileSecret: string;
  authTrustedOrigins: string[];
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (name === "AUTH_SECRET" && value.length < 32)
    throw new Error(
      "AUTH_SECRET must be at least 32 characters. Generate with: openssl rand -base64 32",
    );
  return value;
};

const optional = (name: string, fallback: string): string => process.env[name] ?? fallback;

function buildServerEnv(): ServerEnv {
  const wompiEnvRaw = optional("WOMPI_ENV", "sandbox");
  if (wompiEnvRaw !== "sandbox" && wompiEnvRaw !== "production") {
    throw new Error(`WOMPI_ENV debe ser 'sandbox' o 'production' (recibido: "${wompiEnvRaw}").`);
  }

  return {
    appUrl: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    databaseUrl: required("DATABASE_URL"),
    databasePoolMax: Number(optional("DATABASE_POOL_MAX", "5")),
    authSecret: required("AUTH_SECRET"),
    emailProvider: optional("EMAIL_PROVIDER", "console") as ServerEnv["emailProvider"],
    emailApiKey: optional("EMAIL_API_KEY", ""),
    emailFrom: optional("EMAIL_FROM", "Fakingstore <hola@fakingstore.com>"),
    storageDir: optional("STORAGE_DIR", "storage"),
    storageBaseUrl: optional("STORAGE_BASE_URL", "/api/files"),
    maxUploadBytes: Number(optional("STORAGE_MAX_FILE_BYTES", String(512 * 1024 * 1024))),
    storageBucket: optional("STORAGE_BUCKET", "product-files"),
    // Credenciales S3-compatible (Cloudflare R2). Si falta STORAGE_ENDPOINT o
    // alguna clave, `lib/server/storage.ts` cae al driver local en disco.
    storageEndpoint: optional("STORAGE_ENDPOINT", ""),
    storageAccessKeyId: optional("STORAGE_ACCESS_KEY_ID", ""),
    storageSecretAccessKey: optional("STORAGE_SECRET_ACCESS_KEY", ""),
    // Vigencia de las URLs firmadas de descarga. Corta a propósito: la URL da
    // acceso al objeto sin pasar por la función de Vercel, así que no debe
    // quedar en un historialShared ni en un log como una credencial eternal.
    signedUrlTtlSeconds: Number(optional("SIGNED_URL_TTL_SECONDS", "900")),
    wompiEnv: wompiEnvRaw as ServerEnv["wompiEnv"],
    wompiPublicKey: optional("NEXT_PUBLIC_WOMPI_PUBLIC_KEY", ""),
    wompiIntegritySecret: optional("WOMPI_INTEGRITY_SECRET", ""),
    wompiEventsSecret: optional("WOMPI_EVENTS_SECRET", ""),
    wompiApiUrl: optional("WOMPI_API_URL", ""),
    // Secreto que autoriza a `/api/cron/reconcile`. Vacío = reconciliación
    // desactivada (el endpoint responde 503). Genera con: openssl rand -base64 32
    reconcileSecret: optional("RECONCILE_SECRET", ""),
    // Orígenes adicionales que better-auth acepta en cookies y CSRF, separados
    // por coma. Hace falta cuando el origen real del navegador no es
    // `NEXT_PUBLIC_APP_URL`: por ejemplo, tener a la vez un dominio de producción
    // y `http://localhost:3000` para desarrollo, o un túnel de Cloudflare
    // efímero. Sin esto, better-auth responde 403 "Invalid origin".
    authTrustedOrigins: optional("AUTH_TRUSTED_ORIGINS", "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    isProd: process.env.NODE_ENV === "production",
  };
}

/** Resuelve y memoiza la config. Se evalúa en el primer acceso a una
 *  propiedad, no al importar el módulo, para que `next build` pueda importar
 *  rutas y actions sin exigir variables de runtime en la máquina de build. */
let resolved: ServerEnv | null = null;

function resolveEnv(): ServerEnv {
  resolved ??= buildServerEnv();
  return resolved;
}

/** Misma API que antes (`serverEnv.databaseUrl`), pero la validación ocurre en
 *  el primer uso. Los traps de `ownKeys`/`getOwnPropertyDescriptor` permiten
 *  seguir haciendo spread o destructuring del objeto. */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop, receiver) {
    return Reflect.get(resolveEnv(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(resolveEnv(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(resolveEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const descriptor = Reflect.getOwnPropertyDescriptor(resolveEnv(), prop);
    if (descriptor) descriptor.configurable = true;
    return descriptor;
  },
  set(_target, prop, value) {
    return Reflect.set(resolveEnv(), prop, value);
  },
});