import nodemailer from "nodemailer";

import {
  emailPolicyFrom,
  loadEmailSettings,
  type StoredEmailSettings,
} from "@/lib/server/email-settings";
import {
  openEmailCircuit,
  priorityOf,
  reserveEmail,
  settleEmail,
  type EmailKind,
  type SkipReason,
} from "@/lib/server/email-guard";

/** Correo ya maquetado, sin metadatos de control: es lo que necesitan los
 *  transportes para hablar con el proveedor. */
type RenderedEmail = {
  to: string;
  subject: string;
  html: string;
};

type Email = RenderedEmail & {
  /** Obligatorio a propósito: un correo sin clasificar es un correo cuya
   *  prioridad frente a la cuota diaria nadie decidió. */
  kind: EmailKind;
  /** Clave de idempotencia: un segundo envío con la misma no se repite. */
  dedupeKey?: string;
  /** Orden relacionada, para poder auditar el correo desde la venta. */
  orderId?: string;
};

type SendResult = {
  ok: boolean;
  provider: string;
  /** Motivo de la omisión. Ausente = el proveedor lo aceptó. */
  skipped?: SkipReason;
};

export function wrapEmailLayout(title: string, bodyHtml: string): string {
  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f5f0e8;font-family:Helvetica,Arial,sans-serif;color:#292015;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e4d9c8;border-radius:6px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px;background:#fffaf2;border-bottom:1px solid #e4d9c8;">
                <span style="font-size:18px;font-weight:700;color:#a83a1e;">Fakingstore</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${title}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #f0e6d6;font-size:12px;color:#8a7a63;">
                Fakingstore &middot; Productos digitales para crear
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

/**
 * Envía vía SMTP (Mailgun u otro relay). Se crea un transporte por envío para
 * no cachear credenciales obsoletas si el admin cambia la config en caliente.
 * Puerto 465 = TLS implícito (`secure`); 587/25 usan STARTTLS.
 */
async function sendViaSmtp(
  settings: StoredEmailSettings,
  email: RenderedEmail,
): Promise<SendResult> {
  if (!settings.smtpHost) {
    throw new Error("SMTP sin configurar: falta el host (p. ej. smtp.mailgun.org).");
  }
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    // Sin usuario se asume relay abierto (útil solo en pruebas locales).
    ...(settings.smtpUser
      ? { auth: { user: settings.smtpUser, pass: settings.smtpPassword } }
      : {}),
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });
  try {
    await transporter.sendMail({
      from: settings.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
    });
  } finally {
    transporter.close();
  }
  return { ok: true, provider: "smtp" };
}

/**
 * Envía vía la API HTTP de Mailgun (`POST {base}/v3/{dominio}/messages`):
 * autenticación Basic `api:{API_KEY}` y `application/x-www-form-urlencoded`.
 * La base puede sobreponerse con `MAILGUN_API_BASE` (región o pruebas locales).
 */
async function sendViaMailgun(
  settings: StoredEmailSettings,
  email: RenderedEmail,
): Promise<SendResult> {
  if (!settings.mailgunDomain) {
    throw new Error("Mailgun sin configurar: falta el dominio verificado.");
  }
  if (!settings.mailgunApiKey) {
    throw new Error("Mailgun sin configurar: falta la API key.");
  }
  const base = (settings.mailgunApiBase || "https://api.mailgun.net").replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("from", settings.from);
  params.set("to", email.to);
  params.set("subject", email.subject);
  params.set("html", email.html);

  const res = await fetch(`${base}/v3/${encodeURIComponent(settings.mailgunDomain)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${settings.mailgunApiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    // 429 = cuota diaria agotada. Se abre el circuito para que los correos
    // siguientes no sigan golpeando una API que ya nos está rechazando.
    if (res.status === 429) openEmailCircuit();
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Mailgun API devolvió ${res.status}: ${detail}`);
  }
  return { ok: true, provider: "mailgun" };
}

/** Habla con el proveedor. No toca la bitácora: de eso se encarga `sendEmail`. */
async function deliver(settings: StoredEmailSettings, email: Email): Promise<SendResult> {
  const { to, subject, html } = email;

  if (settings.provider === "mailgun") {
    return sendViaMailgun(settings, { to, subject, html });
  }

  if (settings.provider === "smtp") {
    return sendViaSmtp(settings, { to, subject, html });
  }

  if (settings.provider === "resend") {
    if (!settings.resendApiKey) {
      throw new Error("Resend sin configurar: falta la API key (admin o EMAIL_API_KEY).");
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: settings.from, to, subject, html }),
    });
    if (!res.ok) {
      if (res.status === 429) openEmailCircuit();
      throw new Error(`Resend failed with status ${res.status}`);
    }
    return { ok: true, provider: "resend" };
  }

  console.log(`[email:console] to=${to}`);
  console.log(`[email:console] subject=${subject}`);
  console.log(`[email:console] provider=console`);
  console.log(`[email:console] htmlLength=${html.length}`);
  return { ok: true, provider: "console" };
}

/**
 * ÚNICO punto de envío. Todo correo pasa antes por `reserveEmail`, que decide si
 * hay presupuesto y deja la fila en `email_log`; luego se cierra esa fila con el
 * resultado real. Así las reglas de cuota y deduplicación no dependen de que
 * cada call site se acuerde de aplicarlas.
 *
 * Devuelve `{ ok: false, skipped }` (sin lanzar) cuando el guardia decide no
 * enviar: omitir un correo es una decisión de negocio, no un error.
 */
export async function sendEmail(email: Email): Promise<SendResult> {
  const settings = await loadEmailSettings();
  const policy = emailPolicyFrom(settings);
  const priority = priorityOf(email.kind);

  let logId: string | null = null;
  try {
    const decision = await reserveEmail({
      kind: email.kind,
      to: email.to,
      provider: settings.provider,
      policy,
      dedupeKey: email.dedupeKey,
      orderId: email.orderId,
    });
    if (decision.action === "skip") {
      return { ok: false, provider: settings.provider, skipped: decision.reason };
    }
    logId = decision.logId;
  } catch {
    // El guardia no puede proteger la cuota si su propia BD falla. Se favorece
    // al correo que el cliente está esperando (una compra no puede depender de
    // una tabla de auditoría) y se retiene todo lo demás, para no enviar sin
    // tope justo cuando no hay control.
    if (priority !== "critical") {
      return { ok: false, provider: settings.provider, skipped: "guard_error" };
    }
  }

  try {
    const result = await deliver(settings, email);
    if (logId) await settleEmail(logId, { ok: true, provider: result.provider });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al enviar el correo.";
    if (logId) await settleEmail(logId, { ok: false, provider: settings.provider, error: message });
    throw error;
  }
}
