"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ORDER_STATUSES } from "@/lib/constants";

type ProductOption = { id: string; title: string };
type Initial = { q?: string; status?: string; productId?: string; from?: string; to?: string };

export function SalesFilters({
  products,
  initial,
}: {
  products: ProductOption[];
  initial: Initial;
}) {
  const router = useRouter();
  const [f, setF] = useState<Initial>({
    q: initial.q ?? "",
    status: initial.status ?? "",
    productId: initial.productId ?? "",
    from: initial.from ?? "",
    to: initial.to ?? "",
  });

  function apply() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(f)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/admin/sales?${qs}` : "/admin/sales");
  }

  function clear() {
    setF({ q: "", status: "", productId: "", from: "", to: "" });
    router.push("/admin/sales");
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="sales-q" className="block text-xs font-medium text-muted-foreground">
            Buscar (orden, email, nombre)
          </label>
          <input
            id="sales-q"
            type="text"
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            placeholder="FS-…, cliente@mail.com, Nombre"
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label htmlFor="sales-status" className="block text-xs font-medium text-muted-foreground">
            Estado
          </label>
          <select
            id="sales-status"
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "pending" ? "Pendiente" : s === "approved" ? "Aprobada" : s === "declined" ? "Rechazada" : s === "voided" ? "Anulada" : "Error"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sales-product" className="block text-xs font-medium text-muted-foreground">
            Producto
          </label>
          <select
            id="sales-product"
            value={f.productId}
            onChange={(e) => setF({ ...f, productId: e.target.value })}
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sales-from" className="block text-xs font-medium text-muted-foreground">
            Desde
          </label>
          <input
            id="sales-from"
            type="date"
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label htmlFor="sales-to" className="block text-xs font-medium text-muted-foreground">
            Hasta
          </label>
          <input
            id="sales-to"
            type="date"
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
            className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={apply}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Aplicar filtros
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}