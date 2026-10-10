"use client";

import { useState } from "react";

import {
  getEmailSettings,
  getEmailUsage,
  saveEmailSettings,
  sendTestEmail,
  type EmailSettingsAdmin,
} from "@/lib/server/actions/settings";
import type { EmailUsage } from "@/lib/server/email-guard";

const inputClass =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const fieldClass = "block text-xs font-medium text-muted-foreground";
const btnClass =
  "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const btnGhost =
  "inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50";

const MAILGUN_HOST = "smtp.mailgun.org";

const KIND_LABEL: Record<string, string> = {
  order_approved: "Pedido aprobado",
  magic_link: "Acceso (magic link)",
  password_reset: "Reseteo de contraseña",
  test: "Prueba",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "En vuelo",
  sent: "Enviado",
  failed: "Falló",
  skipped_quota: "Omitido · cuota",
  skipped_duplicate: "Omitido · duplicado",
  skipped_rate_limit: "Omitido · límite",
  skipped_circuit: "Omitido · circuito",
  skipped_guard_error: "Omitido · sin control",
};

const CHIP_RED = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
const CHIP_AMBER = "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";

export function EmailSettingsForm({
  initial,
  usage,
}: {
  initial: EmailSettingsAdmin;
  usage: EmailUsage;
}) {
  const [state, setState] = useState(initial);
  const [usageState, setUsageState] = useState(usage);
  const [provider, setProvider] = useState<EmailSettingsAdmin["provider"]>(initial.provider);
  const [from, setFrom] = useState(initial.from);
  const [smtpHost, setSmtpHost] = useState(initial.smtpHost || MAILGUN_HOST);
  const [smtpPort, setSmtpPort] = useState(String(initial.smtpPort || 587));
  const [smtpSecure, setSmtpSecure] = useState(initial.smtpSecure);
  const [smtpUser, setSmtpUser] = useState(initial.smtpUser);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [mailgunDomain, setMailgunDomain] = useState(initial.mailgunDomain);
  const [mailgunApiKey, setMailgunApiKey] = useState("");
  const [dailyLimit, setDailyLimit] = useState(String(initial.dailyLimit));
  const [criticalReserve, setCriticalReserve] = useState(String(initial.criticalReserve));
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(initial.smtpPasswordSet);
  const [resendApiKeySet, setResendApiKeySet] = useState(initial.resendApiKeySet);
  const [mailgunApiKeySet, setMailgunApiKeySet] = useState(initial.mailgunApiKeySet);

  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onProviderChange(next: EmailSettingsAdmin["provider"]) {
    setProvider(next);
    setMessage(null);
    if (next === "smtp" && !smtpHost) setSmtpHost(MAILGUN_HOST);
  }

  function onPortChange(value: string) {
    setSmtpPort(value);
    const port = Number(value);
    // 465 es TLS implícito; 587/25 negocian con STARTTLS.
    if (port === 465) setSmtpSecure(true);
    else if (port === 587 || port === 25) setSmtpSecure(false);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await saveEmailSettings({
      provider,
      from,
      resendApiKey: resendApiKey || undefined,
      mailgunDomain,
      mailgunApiKey: mailgunApiKey || undefined,
      smtpHost,
      smtpPort: Number(smtpPort) || undefined,
      smtpSecure,
      smtpUser,
      smtpPassword: smtpPassword || undefined,
      dailyLimit: Number(dailyLimit) || 0,
      criticalReserve: Number(criticalReserve) || 0,
    });
    setSaving(false);
    if (res.ok) {
      const fresh = await getEmailSettings();
      setState(fresh);
      setUsageState(await getEmailUsage());
      setSmtpPasswordSet(fresh.smtpPasswordSet);
      setResendApiKeySet(fresh.resendApiKeySet);
      setMailgunApiKeySet(fresh.mailgunApiKeySet);
      setSmtpPassword("");
      setResendApiKey("");
      setMailgunApiKey("");
      setMessage({ ok: true, text: "Configuración de correo guardada (secretos cifrados)." });
    } else {
      setMessage({ ok: false, text: res.error ?? "No se pudo guardar." });
    }
  }

  async function test() {
    setTesting(true);
    setMessage(null);
    const res = await sendTestEmail(testTo);
    setTesting(false);
    setUsageState(await getEmailUsage());
    if (res.ok) {
      setMessage({ ok: true, text: `Correo de prueba enviado con "${res.provider}".` });
    } else {
      setMessage({ ok: false, text: res.error ?? "No se pudo enviar la prueba." });
    }
  }

  const pct =
    usageState.dailyLimit > 0
      ? Math.min(100, Math.round((usageState.sentToday / usageState.dailyLimit) * 100))
      : 0;
  const barTone = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  const skipped = usageState.skippedToday;
  const chips: Array<{ label: string; tone: string }> = [
    ...(usageState.circuitOpen
      ? [{ label: "Circuito abierto (429)", tone: CHIP_RED }]
      : []),
    ...(usageState.failedToday > 0
      ? [{ label: `${usageState.failedToday} fallidos`, tone: CHIP_RED }]
      : []),
    ...(skipped.duplicate > 0
      ? [{ label: `${skipped.duplicate} duplicados evitados`, tone: CHIP_AMBER }]
      : []),
    ...(skipped.rate_limit > 0
      ? [{ label: `${skipped.rate_limit} por límite`, tone: CHIP_AMBER }]
      : []),
    ...(skipped.quota > 0 ? [{ label: `${skipped.quota} sin cuota`, tone: CHIP_RED }] : []),
    ...(skipped.circuit > 0 ? [{ label: `${skipped.circuit} por circuito`, tone: CHIP_RED }] : []),
  ];

  const secretField = (
    label: string,
    value: string,
    setter: (v: string) => void,
    last4: string,
    isSet: boolean,
    placeholder: string,
  ) => (
    <label className="block">
      <span className={fieldClass}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => setter(e.target.value)}
        placeholder={isSet ? `••••••${last4} (vacío = conservar)` : placeholder}
        autoComplete="new-password"
        className={inputClass}
      />
    </label>
  );

  return (
    <div className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold">Correo · Mailgun (SMTP o API)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Los envíos (acceso por enlace mágico, recuperación de contraseña y avisos de compra) salen
        con este proveedor. Puedes usar el <strong>SMTP de Mailgun</strong> o su <strong>API
        HTTP</strong>. Los secretos se cifran en reposo (AES-256-GCM) y nunca se muestran
        completos.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className={fieldClass}>Proveedor</span>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as EmailSettingsAdmin["provider"])}
            className={inputClass}
          >
            <option value="console">Consola (desarrollo · no envía)</option>
            <option value="smtp">SMTP · Mailgun</option>
            <option value="mailgun">Mailgun (API HTTP)</option>
            <option value="resend">Resend (API)</option>
          </select>
        </label>

        <label className="block">
          <span className={fieldClass}>Remitente (From)</span>
          <input
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Fakingstore <hola@tu-dominio.com>"
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Debe ser un dominio verificado en Mailgun.
          </span>
        </label>

        {provider === "smtp" ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <label className="block">
              <span className={fieldClass}>Host SMTP</span>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder={MAILGUN_HOST}
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={fieldClass}>Puerto</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={smtpPort}
                  onChange={(e) => onPortChange(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="mt-5 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary"
                />
                TLS implícito (puerto 465)
              </label>
            </div>
            <label className="block">
              <span className={fieldClass}>Usuario SMTP</span>
              <input
                type="text"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="postmaster@tu-dominio.com"
                className={inputClass}
              />
            </label>
            {secretField(
              "Contraseña SMTP",
              smtpPassword,
              setSmtpPassword,
              state.smtpPasswordLast4,
              smtpPasswordSet,
              "Contraseña SMTP de Mailgun",
            )}
            <p className="text-[11px] text-muted-foreground">
              Mailgun: <strong>smtp.mailgun.org</strong>, puerto <strong>587</strong> (STARTTLS) o{" "}
              <strong>465</strong> (TLS). Usuario = <em>postmaster@tu-dominio.com</em>.
            </p>
          </div>
        ) : null}

        {provider === "mailgun" ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <label className="block">
              <span className={fieldClass}>Dominio verificado de Mailgun</span>
              <input
                type="text"
                value={mailgunDomain}
                onChange={(e) => setMailgunDomain(e.target.value)}
                placeholder="mg.tudominio.com"
                className={inputClass}
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Se usa en <code>/v3/{mailgunDomain || "tu-dominio"}/messages</code>.
              </span>
            </label>
            {secretField(
              "API key de Mailgun",
              mailgunApiKey,
              setMailgunApiKey,
              state.mailgunApiKeyLast4,
              mailgunApiKeySet,
              "key-…",
            )}
          </div>
        ) : null}

        {provider === "resend" ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            {secretField(
              "API key de Resend",
              resendApiKey,
              setResendApiKey,
              state.resendApiKeyLast4,
              resendApiKeySet,
              "re_…",
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={btnClass}>
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            state.configured
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
          }`}
        >
          {state.configured ? "Configurado" : "Sin configurar"}
        </span>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Presupuesto de correo de hoy</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Lo comparten todos los envíos. Al agotarse, el correo se omite y queda registrado aquí
          en vez de que el proveedor lo rechace.
        </p>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            {usageState.available ? (
              <>
                <div className="text-2xl font-semibold tabular-nums">
                  {usageState.sentToday}
                  <span className="text-base font-normal text-muted-foreground">
                    {" / "}
                    {usageState.dailyLimit}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {usageState.criticalReserve > 0
                    ? `${usageState.criticalReserve} turnos reservados a correos críticos`
                    : "Sin reserva para correos críticos"}
                </p>
              </>
            ) : (
              <p className="max-w-sm text-xs text-amber-700 dark:text-amber-400">
                La bitácora de correo no está disponible en este entorno: falta aplicar la
                migración de la tabla <code>email_log</code>. Mientras tanto no se puede medir el
                consumo ni evitar envíos duplicados; los correos críticos se siguen enviando.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={fieldClass}>Límite diario</span>
              <input
                type="number"
                min={0}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={fieldClass}>Reserva para críticos</span>
              <input
                type="number"
                min={0}
                value={criticalReserve}
                onChange={(e) => setCriticalReserve(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        {usageState.available ? (
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
          </div>
        ) : null}

        {chips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {chips.map((chip) => (
              <span key={chip.label} className={`rounded-full px-2.5 py-0.5 font-medium ${chip.tone}`}>
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}

        {usageState.recent.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Destinatario</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {usageState.recent.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="max-w-56 truncate px-3 py-2 text-muted-foreground">
                      {row.recipient}
                    </td>
                    <td className="px-3 py-2">{STATUS_LABEL[row.status] ?? row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : usageState.available ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Todavía no se ha registrado ningún correo.
          </p>
        ) : null}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Probar envío</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Guarda primero y luego envía un correo de prueba con la configuración activa.{" "}
          <strong>Consume presupuesto real</strong> salvo que el proveedor sea «Consola».
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-64 flex-1">
            <span className={fieldClass}>Enviar prueba a</span>
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="tu@email.com"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={test}
            disabled={testing || !testTo}
            className={btnGhost}
          >
            {testing ? "Enviando…" : "Enviar correo de prueba"}
          </button>
        </div>
      </div>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-4 text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
