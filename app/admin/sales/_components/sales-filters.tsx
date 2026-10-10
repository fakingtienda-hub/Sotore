"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ORDER_FLAGS,
  ORDER_FLAG_LABEL,
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
} from "@/lib/constants";

type ProductOption = { id: string; title: string };
type Initial = { q?: string; status?: string; productId?: string; from?: string; to?: string; flag?: string };

const EMPTY: Initial = { q: "", status: "", productId: "", from: "", to: "", flag: "" };

export function SalesFilters({
  products,
  initial,
}: {
  products: ProductOption[];
  initial: Initial;
}) {
  const router = useRouter();
  const [f, setF] = useState<Initial>({ ...EMPTY, ...initial });

  function apply() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(f)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/admin/sales?${qs}` : "/admin/sales");
  }

  function clear() {
    setF(EMPTY);
    router.push("/admin/sales");
  }

  const inputClass =
    "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const labelClass = "block text-xs font-medium text-muted-foreground";

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="sales-q" className={labelClass}>
            Buscar (orden, email, nombre)
          </label>
          <input
            id="sales-q"
            type="text"
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            placeholder="FS-…, cliente@mail.com, Nombre"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="sales-status" className={labelClass}>
            Estado
          </label>
          <select
            id="sales-status"
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
            className={inputClass}
          >
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sales-flag" className={labelClass}>
            Requieren atención
          </label>
          <select
            id="sales-flag"
            value={f.flag}
            onChange={(e) => setF({ ...f, flag: e.target.value })}
            className={inputClass}
          >
            <option value="">Todas</option>
            {ORDER_FLAGS.map((flag) => (
              <option key={flag} value={flag}>
                {ORDER_FLAG_LABEL[flag]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sales-product" className={labelClass}>
            Producto
          </label>
          <select
            id="sales-product"
            value={f.productId}
            onChange={(e) => setF({ ...f, productId: e.target.value })}
            className={inputClass}
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
          <label htmlFor="sales-from" className={labelClass}>
            Desde
          </label>
          <input
            id="sales-from"
            type="date"
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="sales-to" className={labelClass}>
            Hasta
          </label>
          <input
            id="sales-to"
            type="date"
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
            className={inputClass}
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