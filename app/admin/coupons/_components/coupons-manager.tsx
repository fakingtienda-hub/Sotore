"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteCoupon, saveCoupon, toggleCouponStatus } from "@/lib/server/actions/coupons";
import type { Coupon } from "@/lib/db/schema";
import { AutosaveField } from "@/app/admin/_components/autosave-field";
import { formatDate, formatPrice } from "@/lib/utils/format";

type ProductOption = {
  id: string;
  title: string;
  slug: string;
};

type CouponsManagerProps = {
  coupons: Coupon[];
  products: ProductOption[];
};

type FormState = {
  code: string;
  type: "percentage" | "fixed";
  value: string;
  maxUses: string;
  productScope: string[];
  startsAt: string;
  endsAt: string;
  status: "active" | "disabled";
};

function toLocalInput(date: Date | string | null | undefined): string {
  if (date == null) return "";
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const blankForm = (): FormState => ({
  code: "",
  type: "percentage",
  value: "",
  maxUses: "",
  productScope: [],
  startsAt: "",
  endsAt: "",
  status: "active",
});

const inputClass =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function CouponsManager({ coupons, products }: CouponsManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => blankForm());
  const formRef = useRef<FormState>(form);
  const couponIdRef = useRef<string | undefined>(undefined);

  function startCreate() {
    setEditing(null);
    setShowForm(true);
    couponIdRef.current = undefined;
    const next = blankForm();
    formRef.current = { ...next };
    setForm(next);
    setError(null);
  }

  function startEdit(coupon: Coupon) {
    setEditing(coupon);
    setShowForm(true);
    couponIdRef.current = coupon.id;
    const next: FormState = {
      code: coupon.code,
      type: coupon.type as FormState["type"],
      value: String(coupon.value),
      maxUses: coupon.maxUses == null ? "" : String(coupon.maxUses),
      productScope: coupon.productScope ?? [],
      startsAt: toLocalInput(coupon.startsAt),
      endsAt: toLocalInput(coupon.endsAt),
      status: coupon.status as FormState["status"],
    };
    formRef.current = { ...next };
    setForm(next);
    setError(null);
  }

  async function commitForm(patch: Partial<FormState>): Promise<{ ok: boolean; error?: string }> {
    const payload = { ...formRef.current, ...patch };
    const res = await saveCoupon({
      id: couponIdRef.current,
      code: payload.code,
      type: payload.type,
      value: payload.value,
      maxUses: payload.maxUses,
      productScope: payload.productScope,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      status: payload.status,
    });
    if (res.ok) {
      if (res.id) couponIdRef.current = res.id;
      formRef.current = { ...payload };
      setForm({ ...payload });
      setError(null);
      router.refresh();
    } else {
      setError(res.error ?? "No se pudo guardar el cupón.");
    }
    return res;
  }

  async function handleToggle(id: string) {
    await toggleCouponStatus(id);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este cupón? No se puede si ya fue usado en pedidos.")) return;
    await deleteCoupon(id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => (showForm ? setShowForm(false) : startCreate())}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {showForm && !editing ? "Cancelar" : "Nuevo cupón"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              {editing ? `Editar cupón ${editing.code}` : "Nuevo cupón"}
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:text-emerald-400 dark:ring-emerald-900">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Auto-guardado por campo
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="coupon-code" className="block text-sm font-medium text-foreground">Código</label>
              <AutosaveField
                id="coupon-code"
                value={form.code}
                onSave={async (v) => commitForm({ code: v.toUpperCase() })}
                className={`${inputClass} uppercase`}
              />
            </div>
            <div>
              <label htmlFor="coupon-type" className="block text-sm font-medium text-foreground">Tipo</label>
              <AutosaveField
                id="coupon-type"
                as="select"
                value={form.type}
                saveOnChange
                onSave={async (v) => commitForm({ type: v as FormState["type"] })}
                className={inputClass}
              >
                <option value="percentage">Porcentaje (%)</option>
                <option value="fixed">Monto fijo</option>
              </AutosaveField>
            </div>
            <div>
              <label htmlFor="coupon-value" className="block text-sm font-medium text-foreground">
                Valor {form.type === "percentage" ? "(0-100)" : "(en centavos)"}
              </label>
              <AutosaveField
                id="coupon-value"
                type="number"
                min="0"
                step={form.type === "percentage" ? "0.01" : "1"}
                value={form.value}
                onSave={async (v) => commitForm({ value: v })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="coupon-max-uses" className="block text-sm font-medium text-foreground">Usos máximos (opcional)</label>
              <AutosaveField
                id="coupon-max-uses"
                type="number"
                min="1"
                value={form.maxUses}
                onSave={async (v) => commitForm({ maxUses: v })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="coupon-starts-at" className="block text-sm font-medium text-foreground">Inicio</label>
              <AutosaveField
                id="coupon-starts-at"
                type="datetime-local"
                value={form.startsAt}
                onSave={async (v) => commitForm({ startsAt: v })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="coupon-ends-at" className="block text-sm font-medium text-foreground">Fin</label>
              <AutosaveField
                id="coupon-ends-at"
                type="datetime-local"
                value={form.endsAt}
                onSave={async (v) => commitForm({ endsAt: v })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="coupon-status" className="block text-sm font-medium text-foreground">Estado</label>
              <AutosaveField
                id="coupon-status"
                as="select"
                value={form.status}
                saveOnChange
                onSave={async (v) => commitForm({ status: v as FormState["status"] })}
                className={inputClass}
              >
                <option value="active">Activo</option>
                <option value="disabled">Inactivo</option>
              </AutosaveField>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium text-foreground">
              Aplicar a productos <span className="font-normal text-muted-foreground">(vacío = todos)</span>
            </p>
            {products.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No hay productos para restringir.</p>
            ) : (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => {
                  const checked = form.productScope.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const nextScope = e.target.checked
                            ? [...formRef.current.productScope, p.id]
                            : formRef.current.productScope.filter((x) => x !== p.id);
                          void commitForm({ productScope: nextScope });
                        }}
                        className="h-4 w-4"
                      />
                      <span className="truncate">{p.title}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setError(null);
              }}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {coupons.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-foreground">Aún no hay cupones</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea tu primer cupón para ofrecer descuentos en el checkout.
          </p>
        </div>
      ) : coupons.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Usos</th>
                <th className="px-4 py-3 font-medium">Vigencia</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{coupon.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {coupon.type === "percentage" ? "Porcentaje" : "Monto fijo"}
                  </td>
                  <td className="px-4 py-3">
                    {coupon.type === "percentage"
                      ? `${coupon.value}%`
                      : formatPrice(coupon.value)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {coupon.usedCount}
                    {coupon.maxUses != null ? ` / ${coupon.maxUses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {coupon.startsAt ? formatDate(coupon.startsAt) : "—"}
                    {coupon.endsAt ? ` → ${formatDate(coupon.endsAt)}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        coupon.status === "active"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {coupon.status === "active" ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(coupon.id)}
                        className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        {coupon.status === "active" ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(coupon)}
                        className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(coupon.id)}
                        className="rounded border border-border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}