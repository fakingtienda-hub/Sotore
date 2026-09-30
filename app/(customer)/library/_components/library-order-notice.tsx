"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Aviso de "tu pago entró, estamos activando el acceso" / "tu pago se está
 * confirmando". Aparece ENCIMA de la biblioteca para que un cliente que pagó y
 * todavía no ve su curso no se vaya a la tienda a comprarlo otra vez.
 *
 * Hace polling y el banner desaparece solo en cuanto el acceso queda activo:
 * aunque el webhook o la reconciliación tarden, el usuario no tiene que recargar
 * ni escribirnos para enterarse.
 */

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 24;

export type LibraryNoticeData = {
  kind: "delivering" | "confirming";
  orderCode: string;
  titles: string[];
};

const COPY = {
  delivering: {
    icon: "✓",
    title: "Recibimos tu pago",
    body: "Ya estamos activando el acceso a tu compra. Tarda unos segundos y aparece solo aquí: no tienes que hacer nada, ni comprar de nuevo.",
  },
  confirming: {
    icon: "…",
    title: "Estamos confirmando tu pago",
    body: "Tu pedido está en proceso de pago. En cuanto Wompi nos confirme la transacción verás aquí tu curso.",
  },
} as const;

export function LibraryOrderNotice({ notice }: { notice: LibraryNoticeData }) {
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed || polls >= MAX_POLLS) return;
    const id = setTimeout(() => {
      setPolls((p) => p + 1);
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [polls, dismissed, router]);

  if (dismissed) return null;

  const copy = COPY[notice.kind];
  const list = notice.titles.slice(0, 3);
  const exhausted = polls >= MAX_POLLS;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 rounded-2xl border-2 border-dashed border-primary/50 bg-accent/40 p-5"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
          aria-hidden
        >
          {copy.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold">{copy.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>

          {list.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {list.map((title) => (
                <li key={title} className="flex items-center gap-2">
                  <span className="text-primary" aria-hidden>
                    •
                  </span>
                  <span className="text-foreground">{title}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3 font-mono text-xs tracking-[0.15em] text-muted-foreground">
            {notice.orderCode}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                router.refresh();
              }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {exhausted ? "Comprobar de nuevo" : "Comprobar ahora"}
            </button>
            <span className="text-xs text-muted-foreground">
              {exhausted
                ? "Si después de esto sigue igual, escríbenos con el código y lo resolvemos."
                : "Se actualiza solo. Si en unos minutos sigue igual, escríbenos con el código."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
