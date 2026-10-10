"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/server/vault";
import { WOMPI_SETTINGS_KEY } from "@/lib/server/wompi-settings";
import { wompiKeyEnvironment, wompiSecretEnvironment } from "@/lib/server/wompi";
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
  integritySecret: z.string().max(512).optional(),
  eventsSecret: z.string().max(512).optional(),
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
  const publicKey = typeof stored.publicKey === "string" ? stored.publicKey : "";
  const integrityEnc = typeof stored.integritySecret === "string" ? stored.integritySecret : "";
  const eventsEnc = typeof stored.eventsSecret === "string" ? stored.eventsSecret : "";
  const integritySecret = integrityEnc ? decryptSecret(integrityEnc) : null;
  const eventsSecret = eventsEnc ? decryptSecret(eventsEnc) : null;
  const keyEnv = wompiKeyEnvironment(publicKey);
  const integrityEnv = integritySecret ? wompiSecretEnvironment(integritySecret) : null;
  const eventsEnv = eventsSecret ? wompiSecretEnvironment(eventsSecret) : null;

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
  const credentialWarning =
    warnings.length > 0 ? `${warnings.join(" ")} Usa las tres credenciales del mismo entorno.` : null;

  return {
    env,
    publicKey,
    publicKeyLast4: publicKey.slice(-4),
    keyEnv,
    envMismatch: keyEnv !== null && keyEnv !== env,
    credentialWarning,
    configured: !!(publicKey && integritySecret),
    integritySecretSet: !!integritySecret,
    integritySecretLast4: integritySecret?.slice(-4) ?? "",
    eventsSecretSet: !!eventsSecret,
    eventsSecretLast4: eventsSecret?.slice(-4) ?? "",
  };
}

export async function saveWompiSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = wompiSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }

  const { env, publicKey, integritySecret, eventsSecret } = parsed.data;

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

  const value = { env, publicKey, integritySecret: nextIntegrity, eventsSecret: nextEvents };

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