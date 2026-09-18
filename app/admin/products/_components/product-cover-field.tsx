"use client";

import { useRef, useState } from "react";

type ProductCoverFieldProps = {
  productId: string | null;
  initialUrl: string | null;
  onCommitted?: (url: string) => void;
};

export function ProductCoverField({ productId, initialUrl, onCommitted }: ProductCoverFieldProps) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (next: string) => {
    setUrl(next);
    if (productId && onCommitted) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
      onCommitted(next);
    }
  };

  async function handlePick(file: File | undefined) {
    if (!file) return;
    if (!productId) {
      setError("Crea el producto primero: la portada se sube desde la edición.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("La imagen supera los 20 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("productId", productId);
    fd.append("file", file);
    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        storageKey?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.storageKey) {
        throw new Error(json.error ?? "No se pudo subir la imagen.");
      }
      commit(`/api/files/${json.storageKey}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative h-40 w-32 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Portada del producto" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
              Sin portada
            </div>
          )}
          {saved ? (
            <span className="absolute top-1 right-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              ✓ Guardado
            </span>
          ) : null}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="cover-upload"
              className="inline-flex cursor-pointer items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {busy ? "Subiendo…" : url ? "Cambiar imagen" : "Elegir imagen"}
            </label>
            <input
              id="cover-upload"
              ref={inputRef}
              type="file"
              accept="image/*"
              disabled={busy || !productId}
              className="sr-only"
              onChange={(e) => handlePick(e.target.files?.[0])}
            />
            {url ? (
              <button
                type="button"
                onClick={() => commit("")}
                className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Quitar
              </button>
            ) : null}
          </div>

          {!productId ? (
            <p className="text-xs text-muted-foreground">
              La portada se sube después de crear el producto, desde esta pantalla de edición.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WebP o GIF. La tienda la recorta en formato 4:5 automáticamente.
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowUrlInput((v) => !v)}
            className="block text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {showUrlInput ? "Ocultar URL" : "O usar una URL"}
          </button>

          {showUrlInput ? (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => commit(url)}
              placeholder="https://ejemplo.com/portada.jpg"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <input type="hidden" name="coverImageUrl" value={url} />
    </div>
  );
}