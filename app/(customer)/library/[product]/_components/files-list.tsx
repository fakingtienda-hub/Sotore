"use client";

import { useCallback, useEffect, useState } from "react";

import { formatFileSize } from "@/lib/utils/format";

export type LibraryFileRow = {
  id: string;
  name: string;
  fileType: string;
  sizeBytes: number | null;
  mimeType: string | null;
  downloadLimit: number | null;
  groupId: string | null;
};

export type LibraryFileGroup = {
  id: string;
  name: string;
};

function isPreviewable(file: LibraryFileRow): boolean {
  const m = (file.mimeType ?? "").toLowerCase();
  if (m.startsWith("video/") || m.startsWith("audio/") || m.startsWith("image/")) return true;
  if (m === "application/pdf") return true;
  const t = (file.fileType ?? "").toLowerCase();
  return t === "video" || t === "audio" || t === "image" || t === "pdf";
}

function Viewer({ file }: { file: LibraryFileRow }) {
  const m = (file.mimeType ?? "").toLowerCase();
  const src = `/api/files/${file.id}/view`;

  if (m.startsWith("video/")) {
    return (
      <video src={src} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />
    );
  }
  if (m.startsWith("audio/")) {
    return <audio src={src} controls autoPlay className="w-full" />;
  }
  if (m.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={file.name} className="mx-auto max-h-[70vh] rounded-lg" />;
  }
  if (m === "application/pdf") {
    return <iframe src={src} title={file.name} className="h-[70vh] w-full rounded-lg border-0 bg-white" />;
  }

  const t = (file.fileType ?? "").toLowerCase();
  if (t === "video") {
    return (
      <video src={src} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />
    );
  }
  if (t === "audio") {
    return <audio src={src} controls autoPlay className="w-full" />;
  }
  if (t === "pdf") {
    return <iframe src={src} title={file.name} className="h-[70vh] w-full rounded-lg border-0 bg-white" />;
  }

  return (
    <p className="text-sm text-muted-foreground">
      Este tipo de archivo no se puede previsualizar aquí. Usa el botón Descargar.
    </p>
  );
}

export function FilesList({
  files,
  groups,
}: {
  files: LibraryFileRow[];
  groups: LibraryFileGroup[];
}) {
  const [viewing, setViewing] = useState<LibraryFileRow | null>(null);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  const close = useCallback(() => setViewing(null), []);

  const rootGroups = groups.map((g) => g.id);
  const sections = (() => {
    const byGroup = new Map<string | null, LibraryFileRow[]>();
    for (const file of files) {
      const key = file.groupId && rootGroups.includes(file.groupId) ? file.groupId : null;
      const current = byGroup.get(key) ?? [];
      current.push(file);
      byGroup.set(key, current);
    }
    const out: { id: string | null; name: string | null; files: LibraryFileRow[] }[] = [];
    for (const g of groups) {
      const rows = byGroup.get(g.id);
      if (rows && rows.length > 0) out.push({ id: g.id, name: g.name, files: rows });
    }
    const loose = byGroup.get(null);
    if (loose && loose.length > 0) out.push({ id: null, name: null, files: loose });
    return out;
  })();

  const renderRow = (file: LibraryFileRow) => (
    <li key={file.id} className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {file.fileType}
          {file.sizeBytes != null ? ` · ${formatFileSize(file.sizeBytes)}` : ""}
          {file.downloadLimit != null ? ` · Máx. ${file.downloadLimit} descargas` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isPreviewable(file) && (
          <button
            type="button"
            onClick={() => setViewing(file)}
            className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Ver
          </button>
        )}
        <a
          href={`/api/files/${file.id}/download`}
          className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Descargar
        </a>
      </div>
    </li>
  );

  return (
    <>
      {files.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Este producto aún no tiene archivos disponibles.
        </p>
      ) : sections.length === 1 && sections[0].id === null ? (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
          {sections[0].files.map((file) => renderRow(file))}
        </ul>
      ) : (
        <div className="mt-4 space-y-5">
          {sections.map((section) =>
            section.id === null ? (
              <div key="loose">
                <h3 className="font-display text-sm font-semibold text-muted-foreground">
                  Otros archivos
                </h3>
                <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
                  {section.files.map((file) => renderRow(file))}
                </ul>
              </div>
            ) : (
              <details key={section.id} open className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3.5">
                  <span className="flex items-center gap-2 font-display text-sm font-semibold">
                    <svg
                      className="text-muted-foreground transition-transform group-open:rotate-90"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    {section.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {section.files.length} archivo{section.files.length === 1 ? "" : "s"}
                  </span>
                </summary>
                <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
                  {section.files.map((file) => renderRow(file))}
                </ul>
              </details>
            ),
          )}
        </div>
      )}

      {viewing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={viewing.name}
          onClick={close}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-xl bg-card p-4 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="truncate font-display text-lg font-semibold">{viewing.name}</h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
            <Viewer file={viewing} />
          </div>
        </div>
      ) : null}
    </>
  );
}