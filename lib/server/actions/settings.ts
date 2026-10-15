"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { invalidateStorageDriver } from "@/lib/server/storage";
import { createR2Storage } from "@/lib/server/storage-r2";
import {
  envStorageSettings,
  loadStorageSettings,
  storageR2Ready,
  STORAGE_SETTINGS_KEY,
} from "@/lib/server/storage-settings";
import { decryptSecret, encryptSecret } from "@/lib/server/vault";
import { WOMPI_SETTINGS_KEY } from "@/lib/server/wompi-settings";
import {
  normalizeWompiSecret,
  wompiKeyEnvironment,
  wompiPrivateKeyEnvironment,
  wompiSecretEnvironment,
  wompiSecretWarnings,
} from "@/lib/server/wompi";
import { EMAIL_SETTINGS_KEY, emailPolicyFrom, loadEmailSettings } from "@/lib/server/email-settings";
import { DEFAULT_EMAIL_POLICY, getEmailUsage as readEmailUsage, type EmailUsage } from "@/lib/server/email-guard";
import { sendEmail, wrapEmailLayout } from "@/lib/email/send";
const SETTINGS_KEY = "general";

export type StoreSettings = {
  storeName: string;
  currency: string;
  contactEmail: string;
  wompiPublicKey: string;
  socials: {
    instagram: string;
    tiktok: string;
    facebook: string;
  };
};

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "Fakingstore",
  currency: "COP",
  contactEmail: "",
  wompiPublicKey: "",
  socials: { instagram: "", tiktok: "", facebook: "" },
};

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  // Opcional por compatibilidad: la tienda es COP-only y saveStoreSettings siempre escribe "COP".
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .max(3)
    .optional()
    .default("COP"),
  contactEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
  wompiPublicKey: z.string().trim().max(255).optional(),
  socials: z
    .object({
      instagram: z.string().trim().max(255).optional(),
      tiktok: z.string().trim().max(255).optional(),
      facebook: z.string().trim().max(255).optional(),
    })
    .default({}),
});

function defaultStoreSettings(): StoreSettings {
  return { ...DEFAULT_SETTINGS, socials: { ...DEFAULT_SETTINGS.socials } };
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, SETTINGS_KEY))
    .limit(1);

  if (!row) return defaultStoreSettings();

  const parsed = settingsSchema.safeParse(row.value ?? {});
  if (!parsed.success) return defaultStoreSettings();

  return { ...defaultStoreSettings(), ...parsed.data, socials: { ...defaultStoreSettings().socials, ...parsed.data.socials } };
}

export async function saveStoreSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }

  const data = parsed.data;
  const value = {
    storeName: data.storeName,
    // La tienda vende solo en pesos colombianos (Wompi Colombia solo procesa COP).
    currency: "COP",
    contactEmail: data.contactEmail ?? "",
    wompiPublicKey: data.wompiPublicKey ?? "",
    socials: {
      instagram: data.socials?.instagram ?? "",
      tiktok: data.socials?.tiktok ?? "",
      facebook: data.socials?.facebook ?? "",
    },
  };

  const [existing] = await db
    .select({ id: schema.storeSettings.id })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, SETTINGS_KEY))
    .limit(1);

  if (existing) {
    await db
      .update(schema.storeSettings)
      .set({ value: value as object, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, existing.id));
  } else {
    await db.insert(schema.storeSettings).values({ key: SETTINGS_KEY, value: value as object });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

const wompiSettingsSchema = z.object({
  env: z.enum(["sandbox", "production"]),
  publicKey: z.string().trim().max(255),
  // `.trim()`: un secreto copiado del panel de Wompi puede traer espacio o
  // salto de línea al final. En la firma el secreto entra literal en el hash,
  // así que se guarda ya recortado (vacío = conservar el anterior).
  integritySecret: z.string().trim().max(512).optional(),
  eventsSecret: z.string().trim().max(512).optional(),
  // Llave privada de comercio (`prv_…`): no firma el checkout ni se expone al
  // navegador; solo autoriza el LISTADO de transacciones de la reconciliación.
  privateKey: z.string().trim().max(512).optional(),
});

export type WompiSettingsAdmin = {
  env: "sandbox" | "production";
  publicKey: string;
  publicKeyLast4: string;
  /** Entorno que implica el prefijo de la llave guardada. `null` si no se reconoce. */
  keyEnv: "sandbox" | "production" | null;
  /** La llave guardada contradice el entorno seleccionado. */
  envMismatch: boolean;
  configured: boolean;
  integritySecretSet: boolean;
  integritySecretLast4: string;
  eventsSecretSet: boolean;
  eventsSecretLast4: string;
  /** Llave privada (`prv_…`) guardada, para la reconciliación. */
  privateKeySet: boolean;
  privateKeyLast4: string;
  /** Entorno que implica el prefijo de la llave privada. `null` si no se reconoce. */
  privateKeyEnv: "sandbox" | "production" | null;
  /** Avisos de credenciales mezcladas entre entornos, o `null` si todo cuadra. */
  credentialWarning: string | null;
};

function envLabel(e: "sandbox" | "production"): string {
  return e === "production" ? "producción" : "pruebas";
}

export async function getWompiSettings(): Promise<WompiSettingsAdmin> {
  await requireAdmin();

  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, WOMPI_SETTINGS_KEY))
    .limit(1);

  const stored = (row?.value ?? {}) as Record<string, unknown>;
  const env = stored.env === "production" ? "production" : "sandbox";
  const publicKey = typeof stored.publicKey === "string" ? stored.publicKey.trim() : "";
  const integrityEnc = typeof stored.integritySecret === "string" ? stored.integritySecret : "";
  const eventsEnc = typeof stored.eventsSecret === "string" ? stored.eventsSecret : "";
  const privateEnc = typeof stored.privateKey === "string" ? stored.privateKey : "";
  const integritySecret = integrityEnc ? normalizeWompiSecret(decryptSecret(integrityEnc) ?? "") : null;
  const eventsSecret = eventsEnc ? normalizeWompiSecret(decryptSecret(eventsEnc) ?? "") : null;
  const privateKey = privateEnc ? normalizeWompiSecret(decryptSecret(privateEnc) ?? "") : null;
  const keyEnv = wompiKeyEnvironment(publicKey);
  const integrityEnv = integritySecret ? wompiSecretEnvironment(integritySecret) : null;
  const eventsEnv = eventsSecret ? wompiSecretEnvironment(eventsSecret) : null;
  const privateKeyEnv = privateKey ? wompiPrivateKeyEnvironment(privateKey) : null;

  // Wompi no mezcla credenciales entre ambientes: avisar aquí evita que el
  // checkout falle (firma inválida) o que los webhooks no se puedan verificar.
  const warnings: string[] = [];
  if (keyEnv && keyEnv !== env) {
    warnings.push(`La llave pública es de ${envLabel(keyEnv)} pero el entorno seleccionado es ${envLabel(env)}.`);
  }
  if (keyEnv && integrityEnv && integrityEnv !== keyEnv) {
    warnings.push(
      `El secreto de integridad es de ${envLabel(integrityEnv)} y la llave de ${envLabel(keyEnv)}: Wompi rechazaría la firma del checkout.`,
    );
  }
  if (keyEnv && eventsEnv && eventsEnv !== keyEnv) {
    warnings.push(
      `El secreto de eventos es de ${envLabel(eventsEnv)} y la llave de ${envLabel(keyEnv)}: no se podrían verificar los webhooks.`,
    );
  }
  if (keyEnv && privateKeyEnv && privateKeyEnv !== keyEnv) {
    warnings.push(
      `La llave privada es de ${envLabel(privateKeyEnv)} y la pública de ${envLabel(keyEnv)}: la reconciliación no podría listar transacciones.`,
    );
  }
  // Causas típicas de «signature: La firma es inválida» que el prefijo de
  // entorno no caza: llave privada en el campo del secreto, integridad y
  // eventos con el mismo valor, o espacios internos al pegar.
  warnings.push(
    ...wompiSecretWarnings({ integritySecret: integritySecret ?? "", eventsSecret: eventsSecret ?? "" }),
  );
  const credentialWarning =
    warnings.length > 0 ? `${warnings.join(" ")} Usa las tres credenciales del mismo entorno.` : null;

  return {
    env,
    publicKey,
    publicKeyLast4: publicKey.slice(-4),
    keyEnv,
    envMismatch: keyEnv !== null && keyEnv !== env,
    credentialWarning,
    // Misma regla que `getWompiConfig().configured`: el checkout necesita llave,
    // integridad Y eventos. Antes el panel decía "configurado" sin el events
    // secret, mientras el runtime se negaba a cobrar por considerarlo sin
    // configurar. La llave privada NO entra aquí (es opcional, solo para la
    // reconciliación).
    configured: !!(publicKey && integritySecret && eventsSecret),
    integritySecretSet: !!integritySecret,
    integritySecretLast4: integritySecret?.slice(-4) ?? "",
    eventsSecretSet: !!eventsSecret,
    eventsSecretLast4: eventsSecret?.slice(-4) ?? "",
    privateKeySet: !!privateKey,
    privateKeyLast4: privateKey?.slice(-4) ?? "",
    privateKeyEnv,
  };
}

export async function saveWompiSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = wompiSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }

  const { env, publicKey, integritySecret, eventsSecret, privateKey } = parsed.data;

  // El entorno tiene que ser coherente con el prefijo de la llave. En Wompi el
  // checkout cobra según la llave: guardar una `pub_prod_` con "sandbox" haría
  // compras reales sin avisar.
  const keyEnv = wompiKeyEnvironment(publicKey);
  if (publicKey && keyEnv && keyEnv !== env) {
    return {
      ok: false,
      error:
        `La llave pública parece de ${keyEnv === "production" ? "producción (pub_prod_)" : "pruebas (pub_test_)"} ` +
        `pero el entorno seleccionado es ${env === "production" ? "producción" : "sandbox"}. ` +
        "Deben coincidir: con la llave equivocada el checkout cobra en el entorno que no esperas.",
    };
  }

  // Wompi no mezcla credenciales entre ambientes: una llave `pub_test_` con un
  // integrity secret `prod_…` produce una firma que la pasarela rechaza, y un
  // events secret del entorno equivocado deja los webhooks sin verificar.
  if (keyEnv) {
    if (integritySecret) {
      const secEnv = wompiSecretEnvironment(integritySecret);
      if (secEnv && secEnv !== keyEnv) {
        return {
          ok: false,
          error:
            `El secreto de integridad parece de ${envLabel(secEnv)} pero la llave pública es de ${envLabel(keyEnv)}. ` +
            "Wompi rechazaría la firma del checkout; usa las credenciales del mismo entorno.",
        };
      }
    }
    if (eventsSecret) {
      const evtEnv = wompiSecretEnvironment(eventsSecret);
      if (evtEnv && evtEnv !== keyEnv) {
        return {
          ok: false,
          error:
            `El secreto de eventos parece de ${envLabel(evtEnv)} pero la llave pública es de ${envLabel(keyEnv)}. ` +
            "Los webhooks no se podrían verificar; usa las credenciales del mismo entorno.",
        };
      }
    }
    if (privateKey) {
      const prvEnv = wompiPrivateKeyEnvironment(privateKey);
      if (prvEnv && prvEnv !== keyEnv) {
        return {
          ok: false,
          error:
            `La llave privada parece de ${envLabel(prvEnv)} pero la llave pública es de ${envLabel(keyEnv)}. ` +
            "La reconciliación no podría listar transacciones; usa las credenciales del mismo entorno.",
        };
      }
    }
  }

  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, WOMPI_SETTINGS_KEY))
    .limit(1);

  const stored = (row?.value ?? {}) as Record<string, unknown>;

  const nextIntegrity = integritySecret
    ? encryptSecret(integritySecret)
    : typeof stored.integritySecret === "string"
      ? stored.integritySecret
      : "";
  const nextEvents = eventsSecret
    ? encryptSecret(eventsSecret)
    : typeof stored.eventsSecret === "string"
      ? stored.eventsSecret
      : "";
  const nextPrivate = privateKey
    ? encryptSecret(privateKey)
    : typeof stored.privateKey === "string"
      ? stored.privateKey
      : "";

  const value = {
    env,
    publicKey,
    integritySecret: nextIntegrity,
    eventsSecret: nextEvents,
    privateKey: nextPrivate,
  };

  if (row) {
    await db
      .update(schema.storeSettings)
      .set({ value: value as object, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, row.id));
  } else {
    await db.insert(schema.storeSettings).values({ key: WOMPI_SETTINGS_KEY, value: value as object });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

const emailSettingsSchema = z.object({
  provider: z.enum(["console", "resend", "smtp", "mailgun"]),
  from: z
    .string()
    .trim()
    .max(255)
    .refine((v) => v === "" || v.includes("@"), "El remitente debe incluir un email."),
  resendApiKey: z.string().max(512).optional(),
  mailgunDomain: z.string().trim().max(255).optional(),
  mailgunApiKey: z.string().max(512).optional(),
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().trim().max(255).optional(),
  smtpPassword: z.string().max(512).optional(),
  // Presupuesto diario: el plan Free de Mailgun son 100 correos al día.
  dailyLimit: z.coerce.number().int().min(0).max(100_000).optional(),
  criticalReserve: z.coerce.number().int().min(0).max(100_000).optional(),
});

export type EmailSettingsAdmin = {
  provider: "console" | "resend" | "smtp" | "mailgun";
  from: string;
  mailgunDomain: string;
  mailgunApiKeySet: boolean;
  mailgunApiKeyLast4: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordSet: boolean;
  smtpPasswordLast4: string;
  resendApiKeySet: boolean;
  resendApiKeyLast4: string;
  /** Correos que el proveedor acepta al día. */
  dailyLimit: number;
  /** Turnos reservados a los correos críticos frente a los no críticos. */
  criticalReserve: number;
  /** El proveedor elegido tiene lo mínimo para enviar. */
  configured: boolean;
};

/** Config efectiva para el panel: lee BD con fallback a entorno y NUNCA
 *  devuelve secretos completos (solo los últimos 4 caracteres). */
export async function getEmailSettings(): Promise<EmailSettingsAdmin> {
  await requireAdmin();
  const effective = await loadEmailSettings();
  const configured =
    effective.provider === "smtp"
      ? !!effective.smtpHost
      : effective.provider === "resend"
        ? !!effective.resendApiKey
        : effective.provider === "mailgun"
          ? !!(effective.mailgunDomain && effective.mailgunApiKey)
          : true;
  return {
    provider: effective.provider,
    from: effective.from,
    mailgunDomain: effective.mailgunDomain,
    mailgunApiKeySet: !!effective.mailgunApiKey,
    mailgunApiKeyLast4: effective.mailgunApiKey.slice(-4),
    smtpHost: effective.smtpHost,
    smtpPort: effective.smtpPort,
    smtpSecure: effective.smtpSecure,
    smtpUser: effective.smtpUser,
    smtpPasswordSet: !!effective.smtpPassword,
    smtpPasswordLast4: effective.smtpPassword.slice(-4),
    resendApiKeySet: !!effective.resendApiKey,
    resendApiKeyLast4: effective.resendApiKey.slice(-4),
    dailyLimit: effective.dailyLimit,
    criticalReserve: effective.criticalReserve,
    configured,
  };
}

/** Cuánto presupuesto de correo se gastó hoy y qué se omitió, para el panel.
 *
 *  Sin esta lectura el admin no puede saber si está a punto de agotar el plan
 *  Free: Mailgun no expone un contador fiable y solo retiene logs un día. */
export async function getEmailUsage(): Promise<EmailUsage> {
  await requireAdmin();
  const effective = await loadEmailSettings();
  return readEmailUsage(emailPolicyFrom(effective));
}

export async function saveEmailSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = emailSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const d = parsed.data;

  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, EMAIL_SETTINGS_KEY))
    .limit(1);
  const stored = (row?.value ?? {}) as Record<string, unknown>;
  const keep = (v: unknown) => (typeof v === "string" ? v : "");

  // Secreto vacío = conservar el guardado (igual que Wompi).
  const encResend = d.resendApiKey ? encryptSecret(d.resendApiKey) : keep(stored.resendApiKey);
  const encMailgun = d.mailgunApiKey ? encryptSecret(d.mailgunApiKey) : keep(stored.mailgunApiKey);
  const encSmtp = d.smtpPassword ? encryptSecret(d.smtpPassword) : keep(stored.smtpPassword);

  const mailgunDomain = d.mailgunDomain ?? "";
  const smtpHost = d.smtpHost ?? "";
  const smtpPort = d.smtpPort ?? 587;
  const smtpUser = d.smtpUser ?? "";
  const smtpSecure = d.smtpSecure ?? smtpPort === 465;
  const dailyLimit = d.dailyLimit ?? DEFAULT_EMAIL_POLICY.dailyLimit;
  const criticalReserve = d.criticalReserve ?? DEFAULT_EMAIL_POLICY.criticalReserve;

  // Una reserva mayor que el límite dejaría el presupuesto sin turnos útiles.
  if (criticalReserve > dailyLimit) {
    return { ok: false, error: "La reserva para correos críticos no puede superar el límite diario." };
  }

  // Coherencia por proveedor, evaluando lo que quedará guardado.
  if (d.provider === "smtp" && !smtpHost.trim()) {
    return { ok: false, error: "El proveedor SMTP requiere un host (p. ej. smtp.mailgun.org)." };
  }
  if (d.provider === "smtp" && smtpUser.trim() && !encSmtp) {
    return { ok: false, error: "Hay usuario SMTP pero falta la contraseña." };
  }
  if (d.provider === "resend" && !encResend) {
    return { ok: false, error: "El proveedor Resend requiere la API key." };
  }
  if (d.provider === "mailgun" && !mailgunDomain.trim()) {
    return { ok: false, error: "El proveedor Mailgun requiere el dominio verificado." };
  }
  if (d.provider === "mailgun" && !encMailgun) {
    return { ok: false, error: "El proveedor Mailgun requiere la API key." };
  }

  const value = {
    provider: d.provider,
    from: d.from,
    resendApiKey: encResend,
    mailgunDomain,
    mailgunApiKey: encMailgun,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword: encSmtp,
    dailyLimit,
    criticalReserve,
  };

  if (row) {
    await db
      .update(schema.storeSettings)
      .set({ value: value as object, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, row.id));
  } else {
    await db.insert(schema.storeSettings).values({ key: EMAIL_SETTINGS_KEY, value: value as object });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Envía un correo de prueba con la configuración GUARDADA (guarda antes). */
export async function sendTestEmail(
  to: string,
): Promise<{ ok: boolean; error?: string; provider?: string }> {
  await requireAdmin();

  const parsed = z.string().trim().email().max(255).safeParse(to);
  if (!parsed.success) return { ok: false, error: "Email de destino inválido." };

  try {
    const res = await sendEmail({
      to: parsed.data,
      kind: "test",
      subject: "Prueba de configuración de correo",
      html: wrapEmailLayout(
        "Prueba de correo",
        `<p>Si ves este mensaje, el envío de correo está configurado correctamente.</p>
         <p style="font-size:12px;color:#8a7a63;">Enviado desde Configuración del CRM.</p>`,
      ),
    });
    return { ok: true, provider: res.provider };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar el correo." };
  }
}

const storageSettingsSchema = z.object({
  driver: z.enum(["local", "r2"]),
  endpoint: z.string().trim().max(255).optional(),
  bucket: z.string().trim().max(255).optional(),
  accessKeyId: z.string().trim().max(255).optional(),
  secretAccessKey: z.string().trim().max(512).optional(),
});

export type StorageSettingsAdmin = {
  /** Driver elegido en el panel. */
  driver: "local" | "r2";
  endpoint: string;
  bucket: string;
  accessKeyIdSet: boolean;
  accessKeyIdLast4: string;
  secretAccessKeySet: boolean;
  secretAccessKeyLast4: string;
  /** El driver elegido tiene lo mínimo para funcionar (local siempre). */
  configured: boolean;
  /** Driver que realmente se usará tras el fallback a local. */
  activeDriver: "local" | "r2";
  /** `db` si hay fila guardada; `env` si solo vienen del entorno. */
  source: "db" | "env";
};

/** Config efectiva para el panel: BD con fallback a entorno, y NUNCA devuelve
 *  las llaves completas (solo los últimos 4 caracteres). */
export async function getStorageSettings(): Promise<StorageSettingsAdmin> {
  await requireAdmin();

  const [row] = await db
    .select({ id: schema.storeSettings.id })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, STORAGE_SETTINGS_KEY))
    .limit(1);

  const effective = await loadStorageSettings();
  const ready = storageR2Ready(effective);

  return {
    driver: effective.driver,
    endpoint: effective.endpoint,
    bucket: effective.bucket,
    accessKeyIdSet: !!effective.accessKeyId,
    accessKeyIdLast4: effective.accessKeyId.slice(-4),
    secretAccessKeySet: !!effective.secretAccessKey,
    secretAccessKeyLast4: effective.secretAccessKey.slice(-4),
    // Local siempre está listo; R2 exige endpoint + bucket + las dos llaves.
    configured: effective.driver === "r2" ? ready : true,
    activeDriver: effective.driver === "r2" && ready ? "r2" : "local",
    source: row ? "db" : "env",
  };
}

export async function saveStorageSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = storageSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }
  const { driver, endpoint: endpointIn, bucket: bucketIn, accessKeyId, secretAccessKey } = parsed.data;

  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, STORAGE_SETTINGS_KEY))
    .limit(1);
  const stored = (row?.value ?? {}) as Record<string, unknown>;
  const keep = (v: unknown) => (typeof v === "string" ? v : "");
  const env = envStorageSettings();

  const endpoint = (endpointIn?.trim() || keep(stored.endpoint) || env.endpoint).trim();
  const bucket = (bucketIn?.trim() || keep(stored.bucket) || env.bucket).trim();

  // Secreto vacío = conservar el guardado (igual que Wompi/Correo). Las llaves
  // del token de R2 son credenciales: se guardan cifradas en reposo.
  const encAccessKey = accessKeyId ? encryptSecret(accessKeyId) : keep(stored.accessKeyId);
  const encSecretKey = secretAccessKey ? encryptSecret(secretAccessKey) : keep(stored.secretAccessKey);

  if (driver === "r2") {
    if (!/^https?:\/\/.+/i.test(endpoint)) {
      return {
        ok: false,
        error:
          "El endpoint debe ser una URL http(s), p. ej. https://<CUENTA>.r2.cloudflarestorage.com.",
      };
    }
    if (!bucket) return { ok: false, error: "Falta el nombre del bucket." };
    // Vale lo que se escriba ahora, lo ya guardado o lo que venga del entorno.
    const hasAccess = !!(accessKeyId || keep(stored.accessKeyId) || env.accessKeyId);
    const hasSecret = !!(secretAccessKey || keep(stored.secretAccessKey) || env.secretAccessKey);
    if (!hasAccess || !hasSecret) {
      return { ok: false, error: "El driver R2 requiere el Access Key ID y el Secret Access Key." };
    }
  }

  const value = {
    driver,
    endpoint,
    bucket,
    accessKeyId: encAccessKey,
    secretAccessKey: encSecretKey,
  };

  if (row) {
    await db
      .update(schema.storeSettings)
      .set({ value: value as object, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, row.id));
  } else {
    await db.insert(schema.storeSettings).values({ key: STORAGE_SETTINGS_KEY, value: value as object });
  }

  // El runtime cachea el driver; tras guardar hay que forzar que lo relea (las
  // demás instancias lo recogen al vencer el caché).
  invalidateStorageDriver();
  revalidatePath("/admin/settings");
  return { ok: true };
}

const storageTestSchema = z.object({
  endpoint: z.string().trim().max(255).optional(),
  bucket: z.string().trim().max(255).optional(),
  accessKeyId: z.string().trim().max(255).optional(),
  secretAccessKey: z.string().trim().max(512).optional(),
});

/** Prueba la conexión escribiendo y borrando un objeto temporal. Acepta valores
 *  sin guardar (los del formulario) y cae a la config efectiva para lo que falte. */
export async function testStorageConnection(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = storageTestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }

  const effective = await loadStorageSettings();
  const endpoint = (parsed.data.endpoint?.trim() || effective.endpoint).trim();
  const bucket = (parsed.data.bucket?.trim() || effective.bucket).trim();
  const accessKeyId = parsed.data.accessKeyId?.trim() || effective.accessKeyId;
  const secretAccessKey = parsed.data.secretAccessKey?.trim() || effective.secretAccessKey;

  const driver = createR2Storage({ endpoint, accessKeyId, secretAccessKey, bucket });
  if (!driver) {
    return { ok: false, error: "Faltan endpoint, bucket o llaves para probar la conexión." };
  }

  const key = `tmp/healthcheck-${randomUUID()}.txt`;
  try {
    await driver.put(key, new TextEncoder().encode("ok"));
    await driver.remove(key);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo escribir en el bucket." };
  }
}