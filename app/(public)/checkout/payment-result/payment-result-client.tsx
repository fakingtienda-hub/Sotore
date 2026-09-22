"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getCheckoutOrderStatus } from "@/lib/server/actions/checkout";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 30;

const TERMINAL_STATUSES = new Set(["declined", "error", "voided", "expired"]);

type PollResult = { kind: "ok"; status: string } | { kind: "error"; message: string };

const TERMINAL_MESSAGE: Record<string, string> = {
  expired: "El plazo para pagar esta orden venció.",
  declined: "El pago fue rechazado, anulado o falló.",
  voided: "El pago fue rechazado, anulado o falló.",
  error: "El pago fue rechazado, anulado o falló.",
};

export function PaymentResultClient({ orderCode }: { orderCode?: string }) {
  const [result, setResult] = useState<PollResult | null>(null);
  const [polls, setPolls] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (!orderCode) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      const res = await getCheckoutOrderStatus(orderCode);
      if (cancelled) return;
      if (!res.ok) {
        setResult({ kind: "error", message: res.error ?? "No se pudo consultar la orden." });
        return;
      }
      if (res.status === "approved" || TERMINAL_STATUSES.has(res.status)) {
        setResult({ kind: "ok", status: res.status });
        return;
      }
      setPolls((p) => p + 1);
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timer = setTimeout(poll, 800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderCode, runId]);

  const missingCode = !orderCode;
  const okStatus = !missingCode && result?.kind === "ok" ? result.status : null;
  const requestError = !missingCode && result?.kind === "error" ? result.message : null;
  const approved = okStatus === "approved";
  const terminal = okStatus !== null && TERMINAL_STATUSES.has(okStatus);
  const stillWaiting = !requestError && !approved && !terminal && !missingCode;
  const stopped = stillWaiting && polls >= MAX_POLLS;

  const title = approved
    ? "¡Pago recibido!"
    : terminal
      ? "No se completó el pago"
      : requestError
        ? "No se pudo confirmar"
        : "Pago en verificación";

  const body = approved ? (
    "Confirmamos tu pago y tu compra ya está lista para descargar desde tu biblioteca."
  ) : terminal ? (
    (okStatus && TERMINAL_MESSAGE[okStatus]) ?? "El pago no pudo completarse."
  ) : requestError ? (
    requestError
  ) : stopped ? (
    "No hemos recibido la confirmación del proveedor de pago todavía."
  ) : (
    "Recibimos tu pago (o el intento de pago) y estamos confirmándolo con Wompi."
  );

  return (
    <div className="sf-card p-8 text-center">
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-[var(--sf-gold)] text-2xl ${
          approved ? "border-0 bg-[var(--sf-thread)] text-[var(--sf-tag-ink)]" : ""
        }`}
        aria-hidden
      >
        {approved ? "✓" : terminal ? "⚠" : requestError ? "×" : "💳"}
      </div>

      <h1 className="sf-title mt-6 text-4xl text-[var(--sf-paper)]">{title}</h1>

      <p className="sf-muted mt-3 leading-relaxed">{body}</p>

      {orderCode && (
        <p className="mx-auto mt-5 inline-block border-2 border-dashed border-[var(--sf-line-strong)] px-5 py-3 font-mono text-sm font-bold tracking-[0.25em] text-[var(--sf-paper)]">
          {orderCode}
        </p>
      )}

      <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
        {approved ? (
          <Link href="/library" className="sf-btn">
            Ir a mi biblioteca
          </Link>
        ) : terminal || requestError || missingCode ? (
          <Link href="/" className="sf-btn sf-btn-ghost">
            Volver al inicio
          </Link>
        ) : stopped ? (
          <button
            type="button"
            className="sf-btn"
            onClick={() => {
              setResult(null);
              setPolls(0);
              setRunId((r) => r + 1);
            }}
          >
            Comprobar de nuevo
          </button>
        ) : (
          <span className="sf-muted text-xs animate-pulse">Confirmando…</span>
        )}
      </div>
    </div>
  );
}