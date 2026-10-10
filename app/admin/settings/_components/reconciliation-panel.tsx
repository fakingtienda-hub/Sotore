"use client";

import { useState } from "react";

import { runReconciliationNow } from "@/lib/server/actions/reconciliation";
import type { ReconcileStatus } from "@/lib/server/reconcile-log";

/**
 * Salud de la reconciliación de pagos. Existe porque un cron que falla en
 * silencio es indistinguible de una tienda sana: si el panel dice "última
 * corrida: hace 3 días", el problema es el cron y no los pagos.
 */
export function ReconciliationPanel({ status }: { status: ReconcileStatus }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function runNow() {
    setBusy(true);
    setResult(null);
    const res = await runReconciliationNow();
    setBusy(false);
    if (!res.ok) {
      setResult({ ok: false, text: res.error ?? "No se pudo ejecutar." });
      return;
    }
    const r = res.report;
    if (!r) {
      setResult({ ok: false, text: "No se recibió el reporte." });
      return;
    }
    const parts: string[] = [];
    if (r.delivery.repaired.length > 0) {
      parts.push(
        `${r.delivery.repaired.length} entrega(s) reparada(s): ${r.delivery.repaired.join(", ")}`,
      );
    }
    const recovered = [...r.payments.approved, ...r.payments.expiredRecovered];
    if (recovered.length > 0) {
      parts.push(`${recovered.length} pago(s) recuperado(s): ${recovered.join(", ")}`);
    }
    if (r.payments.amountMismatch.length > 0) {
      parts.push(`${r.payments.amountMismatch.length} con monto discrepante (requiere revisión).`);
    }
    setResult({
      ok: true,
      text: parts.length > 0 ? parts.join(" · ") : "Todo en orden: nada que reparar.",
    });
  }

  const stale =
    status.hoursSinceLastRun != null && status.hoursSinceLastRun > 24;

  return (
    <div className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Reconciliación de pagos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recupera pagos que la pasarela notificó pero nunca llegaron, y repara
            compras aprobadas sin acceso entregado.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            status.enabled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
          }`}
        >
          {status.enabled ? "Activa" : "Desactivada"}
        </span>
      </div>

      {!status.enabled ? (
        <p className="mt-4 rounded-md border border-dashed border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Falta definir <code className="font-mono text-xs">RECONCILE_SECRET</code> en el
          entorno. Mientras no exista, el endpoint responde 503 y <strong>ningún pago perdido se
          recupera solo</strong>. Genera el secreto con{" "}
          <code className="font-mono text-xs">openssl rand -base64 32</code>.
        </p>
      ) : (
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Última corrida</dt>
            <dd className={stale ? "font-medium text-red-600" : "font-medium"}>
              {status.lastRun ? formatWhen(status.lastRun.ranAt) : "Nunca"}
              {stale ? " ⚠ hace más de 24 h: revisa el cron" : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sin entregar ahora</dt>
            <dd className="font-medium">
              {status.lastRun?.undeliveredAfterRun ?? "—"}
            </dd>
          </div>
        </dl>
      )}

      {status.lastRun && status.lastRun.repaired + status.lastRun.recovered > 0 ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Última corrida reparó <strong>{status.lastRun.repaired}</strong> entrega(s) y recuperó{" "}
          <strong>{status.lastRun.recovered}</strong> pago(s).
        </p>
      ) : null}

      {status.history.length > 1 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Historial ({status.history.length} corridas)
          </summary>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {status.history.map((h) => (
              <li key={h.ranAt} className="flex justify-between gap-4">
                <span>{formatWhen(h.ranAt)}</span>
                <span>
                  {h.repaired} reparadas · {h.recovered} recuperadas
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runNow}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {busy ? "Ejecutando…" : "Ejecutar ahora"}
        </button>
        {result ? (
          <span className={`text-sm ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.text}
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Es idempotente: correrla de más no daña nada. Lo normal es que la dispare un cron externo
        (cron-job.org, n8n, el cron del hosting) contra{" "}
        <code className="font-mono">/api/cron/reconcile</code> con{" "}
        <code className="font-mono">Authorization: Bearer $RECONCILE_SECRET</code>, una vez por hora.
      </p>
    </div>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
