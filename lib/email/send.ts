import { serverEnv } from "@/lib/serverEnv";

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

export async function sendEmail(email: Email): Promise<SendResult> {
  const { to, subject, html } = email;

  if (serverEnv.emailProvider === "resend") {
    if (!serverEnv.emailApiKey) {
      throw new Error("EMAIL_API_KEY is required when EMAIL_PROVIDER=resend");
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.emailApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: serverEnv.emailFrom, to, subject, html }),
    });
    if (!res.ok) {
      throw new Error(`Resend failed with status ${res.status}`);
    }
    return { ok: true, provider: "resend" };
  }

  if (serverEnv.emailProvider === "smtp") {
    throw new Error("EMAIL_PROVIDER=smtp no está implementado aún (fase de emails). Usa 'console' o 'resend'.");
  }

  console.log(`[email:console] to=${to}`);
  console.log(`[email:console] subject=${subject}`);
  console.log(`[email:console] ---`);
  console.log(html);
  console.log(`[email:console] ---`);
  return { ok: true, provider: "console" };
}