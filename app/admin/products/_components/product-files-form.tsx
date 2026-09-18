"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ProductFile, ProductFileGroup } from "@/lib/db/schema";
import { FILE_TYPES } from "@/lib/constants";
import {
  createProductFileGroup,
  deleteProductFileGroup,
  renameProductFileGroup,
  saveProductFiles,
} from "@/lib/server/actions/products";

type FileRow = ProductFile & {
  uploading: boolean;
  uploadError: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  initialName: string;
};

type ProductFilesFormProps = {
  productId: string;
  files: ProductFile[];
  groups: ProductFileGroup[];
};

const FILE_TYPE_LABELS: Record<string, string> = {
  video: "Video",
  pdf: "PDF",
  zip: "ZIP",
  image: "Imagen",
  audio: "Audio",
  other: "Otro",
};

function inferFileType(mime: string): string {
  if (!mime) return "other";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("7z")) return "zip";
  return "other";
}

function fileTypeIndex(fileType: string): number {
  const idx = FILE_TYPES.indexOf(fileType as (typeof FILE_TYPES)[number]);
  return idx === -1 ? FILE_TYPES.indexOf("other") : idx;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function toMapPayload(rows: FileRow[], productId: string) {
  return rows.map((f, i) => ({
    productId,
    name: f.name,
    description: f.description && f.description.trim() !== "" ? f.description : null,
    fileType: f.fileType,
    mimeType: f.mimeType && f.mimeType.trim() !== "" ? f.mimeType : null,
    sizeBytes: f.sizeBytes,
    storageKey: f.storageKey,
    storageProvider: f.storageProvider,
    downloadLimit: f.downloadLimit,
    groupId: f.groupId ?? null,
    sortOrder: `${i}`,
  }));
}

const groupStatusStyles: Record<string, string> = {
  saving:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-900",
  saved:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-900",
  error:
    "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-400 dark:ring-red-900",
};

export function ProductFilesForm({ productId, files, groups }: ProductFilesFormProps) {
  const router = useRouter();
  const [rows, setRows] = useState<FileRow[]>(() =>
    files.map((f) => ({ ...f, uploading: false, uploadError: null })),
  );

  const [groupRows, setGroupRows] = useState<GroupRow[]>(() =>
    groups.map((g) => ({ id: g.id, name: g.name, initialName: g.name })),
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [groupsStatus, setGroupsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [bulk, setBulk] = useState<{
    active: boolean;
    done: number;
    total: number;
    error: string | null;
  }>({ active: false, done: 0, total: 0, error: null });

  const bulkDoneRef = useRef(0);

  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const rowsRef = useRef(rows);
  const savingRef = useRef(false);
  const statusTimer = useRef<number | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const t = statusTimer.current;
    return () => {
      if (t) window.clearTimeout(t);
    };
  }, []);

  const flash = (next: typeof status) => {
    setStatus(next);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus({ kind: "idle" }), 2600);
  };

  const commit = async (list?: FileRow[], opts?: { quiet?: boolean }): Promise<boolean> => {
    const current = list ?? rowsRef.current;
    if (savingRef.current) return false;
    if (current.length === 0) return false;
    if (current.some((r) => r.name.trim() === "" || r.storageKey.trim() === "")) {
      flash({ kind: "error", message: "Completa el nombre y la ruta de cada archivo para poder guardar." });
      return false;
    }
    if (current.some((r) => r.uploading)) return false;
    savingRef.current = true;
    if (!opts?.quiet) flash({ kind: "saving" });
    const res = await saveProductFiles(productId, {
      productId,
      files: toMapPayload(current, productId),
    });
    savingRef.current = false;
    if (res.ok) {
      if (!opts?.quiet) {
        flash({ kind: "saved" });
        router.refresh();
      }
      return true;
    }
    flash({ kind: "error", message: res.error ?? "No se pudo guardar." });
    return false;
  };

  const patchRow = (i: number, patch: Partial<FileRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    const next: FileRow[] = [
      ...rowsRef.current,
      {
        id: crypto.randomUUID(),
        productId,
        name: "",
        description: null,
        fileType: "other",
        mimeType: null,
        sizeBytes: null,
        storageKey: "",
        storageProvider: "local",
        downloadLimit: null,
        groupId: null,
        minMinutesAfterPayment: 0,
        sortOrder: rowsRef.current.length,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        uploading: false,
        uploadError: null,
      },
    ];
    setRows(next);
    commit(next);
  };

  const removeRow = (i: number) => {
    const next = rowsRef.current.filter((_, idx) => idx !== i);
    setRows(next);
    commit(next);
  };

  const flashGroups = (kind: "saving" | "saved" | "error", message?: string) => {
    setGroupsStatus(kind);
    setGroupsError(message ?? null);
  };

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setNewGroupName("");
    flashGroups("saving");
    const res = await createProductFileGroup({ productId, name });
    if (!res.ok || !res.id) {
      flashGroups("error", res.error ?? "No se pudo crear la carpeta.");
      setNewGroupName(name);
      return;
    }
    setGroupRows((prev) => [...prev, { id: res.id as string, name, initialName: name }]);
    flashGroups("saved");
    router.refresh();
  };

  const handleRenameGroup = async (g: GroupRow) => {
    const nextName = g.name.trim();
    if (!nextName) {
      setGroupRows((prev) => prev.map((x) => (x.id === g.id ? { ...x, name: x.initialName } : x)));
      flashGroups("error", "El nombre de la carpeta no puede estar vacío.");
      return;
    }
    if (nextName === g.initialName) return;
    flashGroups("saving");
    const res = await renameProductFileGroup(g.id, nextName);
    if (!res.ok) {
      setGroupRows((prev) => prev.map((x) => (x.id === g.id ? { ...x, name: x.initialName } : x)));
      flashGroups("error", res.error ?? "No se pudo renombrar la carpeta.");
      return;
    }
    setGroupRows((prev) => prev.map((x) => (x.id === g.id ? { ...x, initialName: nextName } : x)));
    flashGroups("saved");
    router.refresh();
  };

  const handleDeleteGroup = async (id: string) => {
    flashGroups("saving");
    const res = await deleteProductFileGroup(id);
    if (!res.ok) {
      flashGroups("error", res.error ?? "No se pudo eliminar la carpeta.");
      return;
    }
    const current = rowsRef.current;
    const next = current.map((r) => (r.groupId === id ? { ...r, groupId: null } : r));
    setRows(next);
    setGroupRows((prev) => prev.filter((g) => g.id !== id));
    flashGroups("saved");
    commit(next);
    router.refresh();
  };

  const handleUpload = async (i: number, file: File | undefined) => {
    if (!file) return;
    patchRow(i, { uploading: true, uploadError: null });
    const fd = new FormData();
    fd.append("productId", productId);
    fd.append("file", file);
    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        storageKey?: string;
        mimeType?: string;
        sizeBytes?: number;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.storageKey) {
        throw new Error(json.error ?? "Error al subir el archivo.");
      }
      const current = rowsRef.current;
      const next = current.map((r, idx) =>
        idx === i
          ? {
              ...r,
              storageKey: json.storageKey as string,
              mimeType: json.mimeType ?? null,
              sizeBytes: json.sizeBytes ?? null,
              name: file.name,
              fileType: json.mimeType ? inferFileType(json.mimeType) : current[i].fileType,
              uploading: false,
            }
          : r,
      );
      setRows(next);
      commit(next);
    } catch (err) {
      patchRow(i, {
        uploading: false,
        uploadError: err instanceof Error ? err.message : "Error al subir el archivo.",
      });
    }
  };

  const uploadMany = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const list = Array.from(picked).filter((f) => f.size > 0);
    if (list.length === 0) return;

    setBulk({ active: true, done: 0, total: list.length, error: null });
    bulkDoneRef.current = 0;
    const folderNameToId = new Map<string, string>();
    const newRows: FileRow[] = [];
    const errors: string[] = [];

    for (const file of list) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
      const parts = rel.split("/").filter(Boolean);
      const topFolder = parts.length > 1 ? parts[0].trim() : "";
      const displayName = parts.length > 1 ? parts.slice(1).join("/") : file.name;
      let groupId: string | null = null;

      if (topFolder) {
        const existing = groupRows.find((g) => g.name.trim() === topFolder);
        if (existing) {
          groupId = existing.id;
        } else if (folderNameToId.has(topFolder)) {
          groupId = folderNameToId.get(topFolder) ?? null;
        } else {
          const res = await createProductFileGroup({ productId, name: topFolder });
          if (res.ok && res.id) {
            groupId = res.id;
            folderNameToId.set(topFolder, res.id);
            setGroupRows((prev) => [...prev, { id: res.id as string, name: topFolder, initialName: topFolder }]);
          } else {
            errors.push(`No se pudo crear la carpeta «${topFolder}».`);
            bulkDoneRef.current += 1;
            setBulk((prev) => ({ ...prev, done: bulkDoneRef.current }));
            continue;
          }
        }
      }

      try {
        const fd = new FormData();
        fd.append("productId", productId);
        fd.append("file", file);
        const res = await fetch("/api/files/upload", { method: "POST", body: fd });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          storageKey?: string;
          mimeType?: string;
          sizeBytes?: number;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.storageKey) {
          throw new Error(json.error ?? "Error al subir el archivo.");
        }
        newRows.push({
          id: crypto.randomUUID(),
          productId,
          name: displayName,
          description: null,
          fileType: json.mimeType ? inferFileType(json.mimeType) : "other",
          mimeType: json.mimeType ?? null,
          sizeBytes: json.sizeBytes ?? null,
          storageKey: json.storageKey as string,
          storageProvider: "local",
          downloadLimit: null,
          groupId,
          minMinutesAfterPayment: 0,
          sortOrder: rowsRef.current.length + newRows.length,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          uploading: false,
          uploadError: null,
        });
        if (newRows.length % 25 === 0) {
          setRows([...rowsRef.current, ...newRows]);
          await commit([...rowsRef.current, ...newRows], { quiet: true });
        }
      } catch (err) {
        errors.push(`${displayName}: ${err instanceof Error ? err.message : "error"}`);
      }
      bulkDoneRef.current += 1;
      setBulk((prev) => ({ ...prev, done: bulkDoneRef.current }));
    }

    if (newRows.length > 0) {
      const next = [...rowsRef.current, ...newRows];
      setRows(next);
      await commit(next);
    }
    setBulk((prev) => ({
      ...prev,
      active: false,
      error: errors.length > 0 ? `${errors.length} archivo(s) fallaron: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? " …" : ""}` : null,
    }));
    router.refresh();
  };

  const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Sube los archivos de uno en uno, varios a la vez o una carpeta entera (Chrome/Edge): las
          subcarpetas de primer nivel se crean automáticamente como carpetas del pack. Todo se guarda
          al añadir, subir o quitar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.click();
              }
            }}
            className={`cursor-pointer rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted ${
              bulk.active ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <input
              type="file"
              multiple
              className="hidden"
              disabled={bulk.active}
              onChange={(e) => {
                void uploadMany(e.target.files);
                e.target.value = "";
              }}
            />
            + Subir varios
          </label>
          <label
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.click();
              }
            }}
            className={`cursor-pointer rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted ${
              bulk.active ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <input
              type="file"
              multiple
              {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
              className="hidden"
              disabled={bulk.active}
              onChange={(e) => {
                void uploadMany(e.target.files);
                e.target.value = "";
              }}
            />
            + Subir carpeta
          </label>
          <button
            type="button"
            onClick={addRow}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            + Añadir archivo
          </button>
          {status.kind === "saving" || status.kind === "saved" ? (
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                status.kind === "saving"
                  ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-900"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-900"
              }`}
            >
              {status.kind === "saving" ? "Guardando…" : "✓ Guardado"}
            </span>
          ) : null}
        </div>
      </div>

      {status.kind === "error" ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {status.message}
        </p>
      ) : null}

      {bulk.active ? (
        <div
          role="status"
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400"
        >
          Subiendo {bulk.done} de {bulk.total} archivo(s)… No cierres esta página.
        </div>
      ) : bulk.error ? (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
        >
          {bulk.error}
        </div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">Carpetas del pack</h3>
            <p className="text-sm text-muted-foreground">
              Organiza los archivos en carpetas. Tus clientes las verán así en su biblioteca, y el
              ZIP «Descargar todo» respetará esta estructura.
            </p>
          </div>
          {groupsStatus === "saving" || groupsStatus === "saved" || groupsStatus === "error" ? (
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                groupsStatus === "error" ? groupStatusStyles.error : groupStatusStyles[groupsStatus]
              }`}
            >
              {groupsStatus === "saving"
                ? "Guardando…"
                : groupsStatus === "saved"
                  ? "✓ Guardado"
                  : "Error"}
            </span>
          ) : null}
        </div>

        {groupsError ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {groupsError}
          </p>
        ) : null}

        {groupRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay carpetas. Puedes añadir la primera abajo; si no creas ninguna, los archivos se
            listan todos juntos.
          </p>
        ) : (
          <ul className="space-y-2">
            {groupRows.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <input
                  value={g.name}
                  onChange={(e) =>
                    setGroupRows((prev) => prev.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))
                  }
                  onBlur={() => handleRenameGroup(g)}
                  placeholder="Nombre de la carpeta"
                  className={input}
                />
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(g.id)}
                  aria-label={`Eliminar carpeta ${g.name}`}
                  className="shrink-0 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addGroup();
            }}
            placeholder="Nueva carpeta (ej. Videos, PDFs…)"
            className={input}
          />
          <button
            type="button"
            onClick={() => void addGroup()}
            className="shrink-0 rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            + Añadir carpeta
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((f, i) => (
          <fieldset key={f.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`file-${f.id}`} className="mb-1 block text-sm font-medium">
                  Archivo *
                </label>
                <input
                  id={`file-${f.id}`}
                  type="file"
                  disabled={f.uploading}
                  onChange={(e) => handleUpload(i, e.target.files?.[0])}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1 text-right text-sm">
                  {f.uploading ? (
                    <p className="text-muted-foreground">Subiendo…</p>
                  ) : (
                    <>
                      <p className="font-medium text-foreground">{formatBytes(f.sizeBytes)}</p>
                      {f.storageKey ? (
                        <a
                          href={`/api/files/${f.storageKey}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Probar descarga
                        </a>
                      ) : null}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="rounded border border-border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  Quitar
                </button>
              </div>
            </div>

            {f.uploadError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {f.uploadError}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`name-${f.id}`} className="text-sm font-medium">
                  Nombre *
                </label>
                <input
                  id={`name-${f.id}`}
                  required
                  value={f.name}
                  onChange={(e) => patchRow(i, { name: e.target.value })}
                  onBlur={() => commit()}
                  placeholder="video-principal.mp4"
                  className={input}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`fileType-${f.id}`} className="text-sm font-medium">
                  Tipo *
                </label>
                <select
                  id={`fileType-${f.id}`}
                  value={fileTypeIndex(f.fileType)}
                  onChange={(e) => {
                    patchRow(i, { fileType: FILE_TYPES[Number(e.target.value)] ?? "other" });
                    commit();
                  }}
                  className={input}
                >
                  {FILE_TYPES.map((t, idx) => (
                    <option key={t} value={idx}>
                      {FILE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor={`storageKey-${f.id}`} className="text-sm font-medium">
                  Ruta de almacenamiento *
                </label>
                <input
                  id={`storageKey-${f.id}`}
                  required
                  value={f.storageKey}
                  onChange={(e) => patchRow(i, { storageKey: e.target.value })}
                  onBlur={() => commit()}
                  placeholder="products/uuid/archivo.pdf"
                  className={`${input} font-mono text-xs`}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`sizeBytes-${f.id}`} className="text-sm font-medium">
                  Tamaño (bytes)
                </label>
                <input
                  id={`sizeBytes-${f.id}`}
                  type="number"
                  min={0}
                  value={f.sizeBytes ?? 0}
                  onChange={(e) => patchRow(i, { sizeBytes: Number(e.target.value) || 0 })}
                  onBlur={() => commit()}
                  placeholder="0"
                  className={input}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`downloadLimit-${f.id}`} className="text-sm font-medium">
                  Límite de descargas
                </label>
                <input
                  id={`downloadLimit-${f.id}`}
                  type="number"
                  min={1}
                  value={f.downloadLimit ?? ""}
                  onChange={(e) =>
                    patchRow(i, {
                      downloadLimit: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  onBlur={() => commit()}
                  placeholder="ilimitado"
                  className={input}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`storageProvider-${f.id}`} className="text-sm font-medium">
                  Proveedor
                </label>
                <select
                  id={`storageProvider-${f.id}`}
                  value={f.storageProvider}
                  onChange={(e) => {
                    patchRow(i, { storageProvider: e.target.value });
                    commit();
                  }}
                  className={input}
                >
                  <option value="local">Local</option>
                  <option value="s3-compatible">S3 compatible</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`mimeType-${f.id}`} className="text-sm font-medium">
                  MIME type
                </label>
                <input
                  id={`mimeType-${f.id}`}
                  value={f.mimeType ?? ""}
                  onChange={(e) => patchRow(i, { mimeType: e.target.value })}
                  onBlur={() => commit()}
                  placeholder="application/pdf"
                  className={input}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`groupId-${f.id}`} className="text-sm font-medium">
                Carpeta
              </label>
              <select
                id={`groupId-${f.id}`}
                value={f.groupId ?? ""}
                onChange={(e) => {
                  const gid = e.target.value === "" ? null : e.target.value;
                  const current = rowsRef.current;
                  const next = current.map((r, idx) => (idx === i ? { ...r, groupId: gid } : r));
                  setRows(next);
                  commit(next);
                }}
                className={input}
              >
                <option value="">Sin carpeta</option>
                {groupRows.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`description-${f.id}`} className="text-sm font-medium">
                Descripción
              </label>
              <input
                id={`description-${f.id}`}
                value={f.description ?? ""}
                onChange={(e) => patchRow(i, { description: e.target.value })}
                onBlur={() => commit()}
                placeholder="Descripción breve de este archivo"
                className={input}
              />
            </div>
          </fieldset>
        ))}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Este producto todavía no tiene archivos. Añade uno y súbelo.
            </p>
            <button
              type="button"
              onClick={addRow}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              + Añadir archivo
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}