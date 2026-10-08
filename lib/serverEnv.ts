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
  emailSmtpHost: string;
  emailSmtpPort: number;
  emailSmtpSecure: boolean;
  emailSmtpUser: string;
  emailSmtpPassword: string;
  mailgunDomain: string;
  mailgunApiKey: string;
  mailgunApiBase: string;
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

const optional = (name: string, fallback: string): string => process.env[name] ?? fallback;

const firstPresent = (...names: string[]): string => {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
};

/** Resuelve una variable obligatoria aceptando alias, en orden de prioridad. La
 *  integracion de Postgres de Vercel (y la de Supabase) publican la misma
 *  conexion como `POSTGRES_URL` / `POSTGRES_PRISMA_URL`, no como `DATABASE_URL`:
 *  sin estos alias hay que copiar el valor a mano y basta con olvidar una
 *  variable para que toda ruta que toque la base reviente en runtime. */
const requiredAny = (names: string[]): string => {
  const value = firstPresent(...names);
  if (!value)
    throw new Error(`Missing required environment variable: set ${names.join(" or ")}`);
  if (names.includes("AUTH_SECRET") && value.length < 32)
    throw new Error(
      "AUTH_SECRET must be at least 32 characters. Generate with: openssl rand -base64 32",
    );
  return value;
};

function buildServerEnv(): ServerEnv {
  const isProductionRuntime = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  const wompiEnvRaw = optional("WOMPI_ENV", "sandbox");
  if (wompiEnvRaw !== "sandbox" && wompiEnvRaw !== "production") {
    throw new Error(`WOMPI_ENV debe ser 'sandbox' o 'production' (recibido: "${wompiEnvRaw}").`);
  }

  const appUrl = optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  const databaseUrl = requiredAny(["POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL"]);
  const authSecret = requiredAny(["AUTH_SECRET", "BETTER_AUTH_SECRET"]);
  const wompiPublicKey = optional("NEXT_PUBLIC_WOMPI_PUBLIC_KEY", "");
  const wompiIntegritySecret = optional("WOMPI_INTEGRITY_SECRET", "");
  const wompiEventsSecret = optional("WOMPI_EVENTS_SECRET", "");

  if (isProductionRuntime) {
    /* Fatales: sin cualquiera de estas la app no puede servir NI UNA página
       (URL pública, base de datos o secreto de auth) o arrancaría insegura
       (sesiones forgeables). Mejor fallar aquí que renderizar un 500 confuso. */
    const requiredProd = [
      ["NEXT_PUBLIC_APP_URL", appUrl],
      ["POSTGRES_URL / POSTGRES_PRISMA_URL / DATABASE_URL", databaseUrl],
      ["AUTH_SECRET / BETTER_AUTH_SECRET", authSecret],
    ] as const;

    for (const [name, value] of requiredProd) {
      if (!value) {
        throw new Error(`Missing required environment variable for production: ${name}`);
      }
    }

    /* Wompi NO es fatal para que el sitio cargue: `getWompiConfig` ya degrada a
       `configured:false` y el webhook responde 503 sin secreto. Si se exige
       aquí, faltar las claves de pago (aún pendientes) tumba la landing y todo
       el catálogo. Sin ellas se avisa y solo queda deshabilitado el checkout. */
    const missingWompi = [
      ["NEXT_PUBLIC_WOMPI_PUBLIC_KEY", wompiPublicKey],
      ["WOMPI_INTEGRITY_SECRET", wompiIntegritySecret],
      ["WOMPI_EVENTS_SECRET", wompiEventsSecret],
    ].filter(([, value]) => !value);

    if (missingWompi.length) {
      console.warn(
        `[env] Wompi sin configurar (faltan: ${missingWompi
          .map(([name]) => name)
          .join(", ")}). El pago en línea quedará deshabilitado.`,
      );
    }
  }

  return {
    appUrl,
/* En Vercel (serverless) tiene que ir por el pooler en MODO TRANSACCION
     * (puerto 6543), que es lo que publica la integracion como POSTGRES_URL. El
     * modo sesion (puerto 5432, que es lo que trae DATABASE_URL) cierra las
     * conexiones ociosas y las que quedan en el pool se reutilizan muertas: las
     * consultas fallan con "Failed query" sin detalle, primero en los rafitos y
     * con el tiempo en forma de 500 al renderizar la pagina. En produccion no
     * hay que definir DATABASE_URL: sin esa variable el pooler gana y el codigo
     * no depende de un orden de prioridades. Para desarrollo local basta con
     * DATABASE_URL en `.env.local`. */
    databaseUrl,
    databasePoolMax: Number(optional("DATABASE_POOL_MAX", "5")),
    authSecret,
    emailProvider: optional("EMAIL_PROVIDER", "console") as ServerEnv["emailProvider"],
    emailApiKey: optional("EMAIL_API_KEY", ""),
    emailFrom: optional("EMAIL_FROM", "Fakingstore <hola@fakingstore.com>"),
    // SMTP (Mailgun u otro relay). El panel `/admin/settings` los sobreescribe
    // desde la BD; aquí quedan como respaldo por variables de entorno.
    emailSmtpHost: optional("EMAIL_SMTP_HOST", ""),
    emailSmtpPort: Number(optional("EMAIL_SMTP_PORT", "587")),
    emailSmtpSecure: optional("EMAIL_SMTP_SECURE", "").toLowerCase() === "true",
    emailSmtpUser: optional("EMAIL_SMTP_USER", ""),
    emailSmtpPassword: optional("EMAIL_SMTP_PASSWORD", ""),
    // Mailgun por API HTTP (`/v3/{dominio}/messages`). La clave y el dominio se
    // configuran desde el CRM; la base queda solo en env (por región o pruebas).
    mailgunDomain: optional("MAILGUN_DOMAIN", ""),
    mailgunApiKey: optional("MAILGUN_API_KEY", ""),
    mailgunApiBase: optional("MAILGUN_API_BASE", "https://api.mailgun.net").replace(/\/$/, ""),
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
    wompiPublicKey,
    wompiIntegritySecret,
    wompiEventsSecret,
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