"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { simulateDemoPayment, getLibraryAccessUrl } from "@/lib/server/actions/checkout";
import { formatPrice } from "@/lib/utils/format";

type InitResponse = {
  configured: boolean;
  orderCode?: string;
  total?: number;
  currency?: string;
  checkout?: { action: string; fields: { name: string; value: string }[]; redirectUrl: string };
};

export function PaymentWidget({
  orderCode,
  onPaid,
  autoSubmitSec,
}: {
  orderCode: string;
  onPaid?: () => void;
  /**
   * Puente transitorio: si se indica, la tarjeta cuenta regresiva y envía el
   * formulario a Wompi sola (un solo clic desde "Continuar al pago"). Si se
   * omite, el botón de pago es manual.
   */
  autoSubmitSec?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<InitResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demoState, setDemoState] = useState<"idle" | "busy" | "done">("idle");
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoAccessUrl, setDemoAccessUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(autoSubmitSec ?? null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payment/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderCode }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setLoadError("No se pudo iniciar el pago.");
      });
    return () => {
      cancelled = true;
    };
  }, [orderCode]);

  /* La cuenta regresiva solo arranca cuando el formulario ya está montado
     (`data.checkout` disponible): antes de eso no hay nada que enviar. Al llegar
     a cero se envía el formulario GET a Wompi (mismo mecanismo que el botón). */
  useEffect(() => {
    if (secondsLeft == null || !data?.checkout || leaving) return;
    const id = setTimeout(() => {
      if (secondsLeft <= 1) {
        setSecondsLeft(0);
        setLeaving(true);
        formRef.current?.submit();
      } else {
        setSecondsLeft(secondsLeft - 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, data, leaving]);

  async function simulateDemo() {
    if (demoState === "busy") return;
    setDemoState("busy");
    setDemoError(null);
    const res = await simulateDemoPayment(orderCode);
    if (res.ok) {
      setDemoState("done");
      onPaid?.();
      getLibraryAccessUrl(orderCode)
        .then((r) => setDemoAccessUrl(r.ok ? r.url : "/library"))
        .catch(() => setDemoAccessUrl("/library"));
    } else {
      setDemoState("idle");
      setDemoError(res.error ?? "No se pudo simular el pago.");
    }
  }

  if (loadError) {
    return (
      <div className="sf-card mt-4 p-4 text-sm text-[var(--sf-thread)]">
        {loadError}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sf-card mt-4 p-4 text-center text-sm text-[var(--sf-muted)]">
        Preparando el pago…
      </div>
    );
  }

  if (demoState === "done") {
    return (
      <div className="sf-card mt-6 p-6 text-center md:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sf-thread)] text-xl font-bold text-[var(--sf-tag-ink)]">
          ✓
        </div>
        <p className="sf-label mt-5 inline-block rounded-full border border-[var(--sf-line-strong)] px-3 py-1">
          Pago aprobado · modo demo
        </p>
        <h3 className="sf-title mx-auto mt-4 max-w-md text-3xl text-[var(--sf-paper)]">
          ¡Listo, pago recibido!
        </h3>
        <p className="sf-muted mx-auto mt-2 max-w-sm text-[15px] leading-relaxed">
          Tu orden quedó marcada como pagada y el acceso quedó activado de inmediato.
        </p>
        <div className="mt-7 flex justify-center">
          <a href={demoAccessUrl ?? "/library"} className="sf-btn w-full sm:w-auto">
            Ir a mi biblioteca
          </a>
        </div>
      </div>
    );
  }

  if (!data.configured || !data.checkout) {
    return (
      <div className="sf-card mt-4 p-5 text-left">
        <p className="font-semibold text-[var(--sf-paper)]">Pasarela de pago no configurada</p>
        <p className="sf-muted mt-1 text-xs">
          Para activar Wompi define tus credenciales desde el panel de administración (Ajustes → Wompi). No es
          necesario tocar variables de entorno.
        </p>
        <code className="mt-3 block rounded-md border border-dashed border-[var(--sf-line-strong)] bg-[var(--sf-ink-3)] px-3 py-2 font-mono text-[11px] text-[var(--sf-paper-dim)]">
          Administración → Ajustes → Credenciales de Wompi
        </code>
        <button
          type="button"
          onClick={simulateDemo}
          disabled={demoState === "busy"}
          className="sf-btn mt-4"
        >
          {demoState === "busy" ? "Procesando…" : "Simular pago aprobado (demo)"}
        </button>
        {demoError && <p className="mt-2 text-xs font-medium text-[var(--sf-thread)]">{demoError}</p>}
        <p className="sf-muted mt-3 text-xs">
          Modo demo: marca la orden como aprobada sin pasar por Wompi. Solo para desarrollo.
        </p>
      </div>
    );
  }

  const totalLabel = formatPrice(data.total ?? 0, data.currency ?? "COP");
  const hasRedirect = data.checkout.fields.some((f) => f.name === "redirect-url");
  const bridge = autoSubmitSec != null;

  return (
    <>
      <form
        ref={formRef}
        action={data.checkout.action}
        method="GET"
        className={`sf-card mt-6 p-6 text-center md:p-8${bridge ? "" : " text-left"}`}
      >
        {bridge ? (
          <>
            <div
              className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[var(--sf-line-strong)] border-t-[var(--sf-gold)] motion-reduce:animate-none"
              aria-hidden
            />
            <h2 className="sf-title mt-5 text-3xl text-[var(--sf-paper)]">
              {leaving ? "Abriendo Wompi…" : "Redirigiendo a Wompi…"}
            </h2>
            <p className="sf-muted mx-auto mt-2 max-w-sm text-sm leading-relaxed">
              Tu orden quedó registrada. Te llevamos a la pasarela segura para completar el pago de{" "}
              <span className="font-semibold text-[var(--sf-paper)]">{totalLabel}</span>.
            </p>
            {!leaving && secondsLeft != null ? (
              <p className="sf-label mt-4 tabular-nums" aria-live="polite">
                Continúa solo en {secondsLeft} s
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[var(--sf-gold)]">✓</span>
              <p className="font-semibold text-[var(--sf-paper)]">Pago seguro con Wompi</p>
            </div>
            <p className="sf-muted mt-1.5 text-xs">
              Serás redirigido a la pasarela de Wompi para completar el pago de{" "}
              <span className="font-semibold text-[var(--sf-paper)]">{totalLabel}</span>.
            </p>
          </>
        )}

        {data.checkout.fields.map((field) => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}

        <button
          type="submit"
          onClick={() => setLeaving(true)}
          disabled={leaving}
          className="sf-btn mt-6 w-full text-lg"
        >
          {leaving
            ? "Abriendo Wompi…"
            : bridge
              ? `Ir a Wompi ahora (${totalLabel})`
              : `Pagar con Wompi (${totalLabel})`}
        </button>

        {bridge ? (
          <p className="mt-5 text-xs text-[var(--sf-muted)]">
            Tu código de orden es{" "}
            <span className="mt-2 inline-block border-2 border-dashed border-[var(--sf-line-strong)] px-3 py-1.5 font-mono text-sm font-bold tracking-[0.2em] text-[var(--sf-paper)]">
              {orderCode}
            </span>
            . Guárdalo por si necesitas volver a la pasarela.
          </p>
        ) : (
          <p className="sf-muted mt-3 text-xs">
            Referencia de pago: <span className="font-mono text-[var(--sf-paper)]">{orderCode}</span>.{" "}
            {hasRedirect
              ? "Una vez pagado, te redirigiremos para confirmar tu compra."
              : "Una vez pagado, Wompi confirmará la operación; vuelve aquí para verificar tu compra."}
          </p>
        )}
      </form>

      {!hasRedirect && (
        <div className="sf-muted mt-3 text-center text-xs">
          <Link
            href={`/checkout/payment-result?order=${orderCode}`}
            className="font-semibold underline underline-offset-2"
          >
            Ver estado de mi compra
          </Link>
        </div>
      )}
    </>
  );
}
