import nodemailer from "nodemailer";

import { loadEmailSettings, type StoredEmailSettings } from "@/lib/server/email-settings";

type Email = {
  to: string;
  subject: string;
  html: string;
};

type SendResult = { ok: boolean; provider: string };

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
async function sendViaSmtp(settings: StoredEmailSettings, email: Email): Promise<SendResult> {
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
  email: Email,
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
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Mailgun API devolvió ${res.status}: ${detail}`);
  }
  return { ok: true, provider: "mailgun" };
}

export async function sendEmail(email: Email): Promise<SendResult> {
  const { to, subject, html } = email;
  const settings = await loadEmailSettings();

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
