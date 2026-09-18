"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { generatePackZip } from "@/lib/server/actions/products";
import { formatFileSize } from "@/lib/utils/format";

type PackZipManagerProps = {
  productId: string;
  zipGeneratedAt: Date | null;
  zipSizeBytes: number | null;
};

export function PackZipManager({ productId, zipGeneratedAt, zipSizeBytes }: PackZipManagerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    setStatus("idle");
    setMessage(null);
    const res = await generatePackZip(productId);
    setBusy(false);
    if (!res.ok) {
      setStatus("error");
      setMessage(res.error ?? "No se pudo generar el ZIP.");
      return;
    }
    setStatus("saved");
    setMessage(`ZIP generado (${formatFileSize(res.sizeBytes ?? 0)}).`);
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">Paquete ZIP «Descargar todo»</h3>
          <p className="text-sm text-muted-foreground">
            Genera un ZIP único con todos los archivos, manteniendo la estructura de carpetas del
            pack. Tus clientes lo verán como botón «Descargar todo» en su biblioteca.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Generando…" : zipGeneratedAt ? "Regenerar ZIP" : "Generar ZIP"}
        </button>
      </div>

      {zipGeneratedAt ? (
        <p className="text-sm text-muted-foreground">
          {zipSizeBytes != null ? (
            <a
              href={`/api/products/${productId}/pack`}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Probar descarga
            </a>
          ) : null}
          {zipSizeBytes != null && zipGeneratedAt ? " · " : ""}
          {zipGeneratedAt ? `Generado ${zipGeneratedAt.toLocaleString("es-CO")}` : ""}
          {zipSizeBytes != null ? ` · ${formatFileSize(zipSizeBytes)}` : ""}
        </p>
      ) : null}

      {status === "saved" ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          {message}
        </p>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}