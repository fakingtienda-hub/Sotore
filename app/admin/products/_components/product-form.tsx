"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createProduct, updateProduct } from "@/lib/server/actions/products";

import { PRODUCT_STATUSES, LANDING_THEMES } from "@/lib/constants";
import { AutosaveField } from "@/app/admin/_components/autosave-field";
import { ProductCoverField } from "./product-cover-field";

const CURRENCIES = [
  { value: "COP", label: "COP – Peso colombiano" },
  { value: "USD", label: "USD – Dólar estadounidense" },
  { value: "MXN", label: "MXN – Peso mexicano" },
  { value: "EUR", label: "EUR – Euro" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

type EditValues = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  theme: string;
  status: string;
  coverImageUrl: string | null;
};

type ProductFormProps = {
  mode: "create" | "edit";
  product?: EditValues | null;
};

function toCents(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fromCents(value: number | null | undefined): string {
  return value == null ? "" : String(Math.round(value) / 100);
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

export function ProductForm({ mode, product }: ProductFormProps) {
  const router = useRouter();

  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      title: String(fd.get("title") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      shortDescription: fd.get("shortDescription") ? String(fd.get("shortDescription")) : undefined,
      description: fd.get("description") ? String(fd.get("description")) : undefined,
      price: toCents(String(fd.get("price") ?? "")),
      compareAtPrice: fd.get("compareAtPrice") ? toCents(String(fd.get("compareAtPrice"))) : null,
      currency: String(fd.get("currency") ?? "COP"),
      theme: String(fd.get("theme") ?? "costura"),
      status: String(fd.get("status") ?? "draft"),
      coverImageUrl: fd.get("coverImageUrl") ? String(fd.get("coverImageUrl")) : null,
    };
    const res = await createProduct(input);
    setCreating(false);
    if (!res.ok) {
      setCreateError(res.error ?? "No se pudo crear el producto.");
      return;
    }
    router.push(`/admin/products/${res.id}/files`);
    router.refresh();
  }

  if (mode === "create") {
    return (
      <form onSubmit={handleCreate} className="space-y-6">
        {createError ? (
          <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {createError}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-foreground">Título *</span>
            <input
              name="title"
              defaultValue=""
              required
              minLength={2}
              maxLength={200}
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-foreground">Slug *</span>
            <input
              name="slug"
              defaultValue=""
              required
              placeholder="mi-producto"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-foreground">Precio *</span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              required
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-foreground">Precio tachado</span>
            <input
              name="compareAtPrice"
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-foreground">Moneda</span>
            <select
              name="currency"
              defaultValue="COP"
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-foreground">Apariencia de la landing</span>
            <select
              name="theme"
              defaultValue="costura"
              className={inputClass}
            >
              {LANDING_THEMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              Define el look de la tienda cuando este producto es el destacado; también se usa en su ficha y en el
              checkout.
            </span>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-foreground">Estado</span>
            <select
              name="status"
              defaultValue="draft"
              className={inputClass}
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="mb-1 block text-sm font-medium text-foreground">Imagen de portada</span>
          <ProductCoverField productId={null} initialUrl={null} />
        </div>

        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Descripción corta</span>
          <input name="shortDescription" maxLength={300} className={inputClass} />
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Descripción</span>
          <textarea name="description" rows={6} maxLength={10000} className={inputClass} />
        </label>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/products"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear producto y subir archivos"}
          </button>
        </div>
      </form>
    );
  }

  const id = product?.id ?? "";
  const save = (patch: Record<string, unknown>) => updateProduct(id, patch);
  const refresh = () => router.refresh();

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
        ✎ Todo se guarda automáticamente al salir de cada campo. Ya no necesitas pulsar
        «Guardar cambios».
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-foreground">Título *</span>
          <AutosaveField
            value={product?.title ?? ""}
            onSave={async (v) => save({ title: v })}
            onSaved={refresh}
            minLength={2}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Slug *</span>
          <AutosaveField
            value={product?.slug ?? ""}
            onSave={async (v) => save({ slug: v })}
            onSaved={refresh}
            placeholder="mi-producto"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Precio *</span>
          <AutosaveField
            value={product ? fromCents(product.price) : ""}
            type="number"
            min="0"
            step="0.01"
            onSave={async (v) => save({ price: toCents(v) })}
            onSaved={refresh}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Precio tachado</span>
          <AutosaveField
            value={product ? fromCents(product.compareAtPrice) : ""}
            type="number"
            min="0"
            step="0.01"
            onSave={async (v) => save({ compareAtPrice: v === "" ? null : toCents(v) })}
            onSaved={refresh}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Moneda</span>
          <AutosaveField
            as="select"
            value={product?.currency ?? "COP"}
            saveOnChange
            onSave={async (v) => save({ currency: v })}
            onSaved={refresh}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </AutosaveField>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Apariencia de la landing</span>
          <AutosaveField
            as="select"
            value={product?.theme ?? "costura"}
            saveOnChange
            onSave={async (v) => save({ theme: v })}
            onSaved={refresh}
            className={inputClass}
          >
            {LANDING_THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </AutosaveField>
          <span className="mt-1 block text-xs text-muted-foreground">
            Define el look de la tienda cuando este producto es el destacado; también se usa en su ficha y en el
            checkout.
          </span>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-foreground">Estado</span>
          <AutosaveField
            as="select"
            value={product?.status ?? "draft"}
            saveOnChange
            onSave={async (v) => save({ status: v })}
            onSaved={refresh}
            className={inputClass}
          >
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </AutosaveField>
        </label>
      </div>

      <div className="space-y-2">
        <span className="mb-1 block text-sm font-medium text-foreground">Imagen de portada</span>
        <ProductCoverField
          productId={id}
          initialUrl={product?.coverImageUrl ?? null}
          onCommitted={(url) => {
            void save({ coverImageUrl: url === "" ? null : url }).then((res) => {
              if (res.ok) refresh();
            });
          }}
        />
      </div>

      <label>
        <span className="mb-1 block text-sm font-medium text-foreground">Descripción corta</span>
        <AutosaveField
          value={product?.shortDescription ?? ""}
          maxLength={300}
          onSave={async (v) => save({ shortDescription: v === "" ? undefined : v })}
          onSaved={refresh}
          className={inputClass}
        />
      </label>

      <label>
        <span className="mb-1 block text-sm font-medium text-foreground">Descripción</span>
        <AutosaveField
          as="textarea"
          value={product?.description ?? ""}
          rows={6}
          maxLength={10000}
          onSave={async (v) => save({ description: v === "" ? undefined : v })}
          onSaved={refresh}
          className={inputClass}
        />
      </label>
    </div>
  );
}