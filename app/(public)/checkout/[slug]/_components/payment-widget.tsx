"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { simulateDemoPayment } from "@/lib/server/actions/checkout";
import { formatPrice } from "@/lib/utils/format";

type InitResponse = {
  configured: boolean;
  orderCode?: string;
  total?: number;
  currency?: string;
  checkout?: { action: string; fields: { name: string; value: string }[]; redirectUrl: string };
};

const REQUIRED_ENV = ["NEXT_PUBLIC_WOMPI_PUBLIC_KEY", "WOMPI_INTEGRITY_SECRET", "WOMPI_EVENTS_SECRET", "WOMPI_ENV"];

export function PaymentWidget({ orderCode, onPaid }: { orderCode: string; onPaid?: () => void }) {
  const [data, setData] = useState<InitResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demoState, setDemoState] = useState<"idle" | "busy" | "done">("idle");
  const [demoError, setDemoError] = useState<string | null>(null);

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

  async function simulateDemo() {
    if (demoState === "busy") return;
    setDemoState("busy");
    setDemoError(null);
    const res = await simulateDemoPayment(orderCode);
    if (res.ok) {
      setDemoState("done");
      onPaid?.();
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
          <Link href="/library" className="sf-btn w-full sm:w-auto">
            Ir a mi biblioteca
          </Link>
        </div>
      </div>
    );
  }

  if (!data.configured || !data.checkout) {
    return (
      <div className="sf-card mt-4 p-5 text-left">
        <p className="font-semibold text-[var(--sf-paper)]">Pasarela de pago no configurada</p>
        <p className="sf-muted mt-1 text-xs">
          Para activar Wompi define estas variables de entorno (sandbox de tu cuenta de Wompi):
        </p>
        <code className="mt-3 block rounded-md border border-dashed border-[var(--sf-line-strong)] bg-[var(--sf-ink-3)] px-3 py-2 font-mono text-[11px] text-[var(--sf-paper-dim)]">
          {REQUIRED_ENV.join(" · ")}
        </code>
        <p className="sf-muted mt-2 text-xs">
          Una vez configurada, este panel muestra el botón de pago de Wompi (Web Checkout hospedado).
        </p>
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

  return (
    <form action={data.checkout.action} method="GET" className="sf-card mt-6 p-5 text-left">
      <div className="flex items-center gap-2">
        <span className="text-[var(--sf-gold)]">✓</span>
        <p className="font-semibold text-[var(--sf-paper)]">Pago seguro con Wompi</p>
      </div>
      <p className="sf-muted mt-1.5 text-xs">
        Serás redirigido a la pasarela de Wompi para completar el pago de{" "}
        <span className="font-semibold text-[var(--sf-paper)]">{totalLabel}</span>.
      </p>
      {data.checkout.fields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <button type="submit" className="sf-btn mt-4 w-full text-lg">
        Pagar con Wompi ({totalLabel})
      </button>
      <p className="sf-muted mt-3 text-xs">
        Referencia de pago: <span className="font-mono text-[var(--sf-paper)]">{orderCode}</span>. Una vez pagado, te
        redirigiremos para confirmar tu compra.
      </p>
    </form>
  );
}