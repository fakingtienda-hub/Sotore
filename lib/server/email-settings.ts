import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { DEFAULT_EMAIL_POLICY, type EmailPolicy } from "@/lib/server/email-guard";
import { decryptSecret } from "@/lib/server/vault";
import { serverEnv } from "@/lib/serverEnv";

export type EmailProvider = "console" | "resend" | "smtp" | "mailgun";

export type StoredEmailSettings = {
  provider: EmailProvider;
  /** Remitente visible, p. ej. `Fakingstore <hola@dominio.com>`. */
  from: string;
  resendApiKey: string;
  /** Dominio verificado de Mailgun (va en la ruta `/v3/{dominio}/messages`). */
  mailgunDomain: string;
  mailgunApiKey: string;
  /** Base de la API (env): `https://api.mailgun.net` (o regional). No se edita. */
  mailgunApiBase: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  /** Presupuesto diario de correo (plan Free de Mailgun = 100). */
  dailyLimit: number;
  /** Turnos que se reservan a los correos críticos frente a los no críticos. */
  criticalReserve: number;
};

/**
 * Fuente de verdad de la configuración de correo: BD (preferente) con fallback
 * a variables de entorno. La BD la llena el panel de administración
 * (`/admin/settings`), con los secretos cifrados en reposo (AES-256-GCM vía
 * `lib/server/vault`). Así el comercio configura el SMTP de Mailgun sin tocar
 * archivos ni reiniciar el proceso.
 */
export const EMAIL_SETTINGS_KEY = "email";

/** Puerto 465 = TLS implícito (`secure`); 587/25 usan STARTTLS (`secure` false). */
export function defaultSmtpSecure(port: number): boolean {
  return port === 465;
}

/** Traduce la configuración efectiva al presupuesto que aplica el guardia.
 *
 *  Vive aquí para que el envío y el panel usen exactamente la misma política:
 *  si el panel mostrara un límite distinto al que aplica el guardia, el aviso
 *  de cuota sería inútil. */
export function emailPolicyFrom(settings: StoredEmailSettings): EmailPolicy {
  return {
    ...DEFAULT_EMAIL_POLICY,
    dailyLimit: settings.dailyLimit,
    criticalReserve: settings.criticalReserve,
  };
}

export async function loadEmailSettings(): Promise<StoredEmailSettings> {
  const out: StoredEmailSettings = {
    provider: serverEnv.emailProvider,
    from: serverEnv.emailFrom,
    resendApiKey: serverEnv.emailApiKey,
    mailgunDomain: serverEnv.mailgunDomain,
    mailgunApiKey: serverEnv.mailgunApiKey,
    mailgunApiBase: serverEnv.mailgunApiBase,
    smtpHost: serverEnv.emailSmtpHost,
    smtpPort: serverEnv.emailSmtpPort,
    smtpSecure: serverEnv.emailSmtpSecure,
    smtpUser: serverEnv.emailSmtpUser,
    smtpPassword: serverEnv.emailSmtpPassword,
    dailyLimit: serverEnv.emailDailyLimit,
    criticalReserve: serverEnv.emailCriticalReserve,
  };

  try {
    const [row] = await db
      .select()
      .from(schema.storeSettings)
      .where(eq(schema.storeSettings.key, EMAIL_SETTINGS_KEY))
      .limit(1);

    if (row?.value && typeof row.value === "object") {
      const v = row.value as Record<string, unknown>;
      if (v.provider === "console" || v.provider === "resend" || v.provider === "smtp" || v.provider === "mailgun") {
        out.provider = v.provider;
      }
      if (typeof v.from === "string" && v.from.trim()) out.from = v.from.trim();
      if (typeof v.resendApiKey === "string") {
        const dec = decryptSecret(v.resendApiKey);
        if (dec) out.resendApiKey = dec;
      }
      if (typeof v.mailgunDomain === "string" && v.mailgunDomain.trim()) {
        out.mailgunDomain = v.mailgunDomain.trim();
      }
      if (typeof v.mailgunApiKey === "string") {
        const dec = decryptSecret(v.mailgunApiKey);
        if (dec) out.mailgunApiKey = dec;
      }
      if (typeof v.smtpHost === "string" && v.smtpHost.trim()) out.smtpHost = v.smtpHost.trim();
      if (
        typeof v.smtpPort === "number" &&
        Number.isInteger(v.smtpPort) &&
        v.smtpPort > 0 &&
        v.smtpPort <= 65535
      ) {
        out.smtpPort = v.smtpPort;
      }
      if (typeof v.smtpSecure === "boolean") out.smtpSecure = v.smtpSecure;
      if (typeof v.smtpUser === "string") out.smtpUser = v.smtpUser.trim();
      if (typeof v.smtpPassword === "string") {
        const dec = decryptSecret(v.smtpPassword);
        if (dec) out.smtpPassword = dec;
      }
      if (typeof v.dailyLimit === "number" && Number.isInteger(v.dailyLimit) && v.dailyLimit >= 0) {
        out.dailyLimit = v.dailyLimit;
      }
      if (
        typeof v.criticalReserve === "number" &&
        Number.isInteger(v.criticalReserve) &&
        v.criticalReserve >= 0 &&
        v.criticalReserve <= out.dailyLimit
      ) {
        out.criticalReserve = v.criticalReserve;
      }
    }
  } catch {
    // Sin acceso a BD o fila inválida: se queda con las variables de entorno.
  }

  return out;
}
