"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { formatFileSize, formatPrice } from "@/lib/utils/format";

export type LibraryFileRow = {
  id: string;
  name: string;
  fileType: string;
  sizeBytes: number | null;
  mimeType: string | null;
  downloadLimit: number | null;
  groupId: string;
  createdAt: string;
  downloadCount: number;
};

export type LibraryFileGroup = {
  id: string;
  name: string;
  count: number;
};

export type LibraryProduct = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  coverImageUrl: string | null;
  zipSizeBytes: number | null;
};

type IconProps = { size?: number };

function Icon({ size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </Icon>
);

const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <Icon>
    <path
      d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
      fill={filled ? "currentColor" : "none"}
    />
  </Icon>
);

const DownloadIcon = () => (
  <Icon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </Icon>
);

const XIcon = () => (
  <Icon>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);

const ChevronIcon = () => (
  <Icon>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

const SparklesIcon = () => (
  <Icon>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </Icon>
);

const FileTextIcon = () => (
  <Icon>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </Icon>
);

const PrinterIcon = () => (
  <Icon>
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect width="12" height="8" x="6" y="14" />
  </Icon>
);

const InfinityIcon = () => (
  <Icon>
    <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
  </Icon>
);

const EyeIcon = () => (
  <Icon>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

const FolderSearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
    <path d="m8 11 2 2 4-4" />
  </Icon>
);

const FolderIcon = () => (
  <Icon>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </Icon>
);

const PawPrintIcon = () => (
  <Icon>
    <circle cx="11" cy="4" r="2" />
    <circle cx="18" cy="8" r="2" />
    <circle cx="20" cy="16" r="2" />
    <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
  </Icon>
);

const GhostIcon = () => (
  <Icon>
    <path d="M9 10h.01" />
    <path d="M15 10h.01" />
    <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8Z" />
  </Icon>
);

const GemIcon = () => (
  <Icon>
    <path d="M6 3h12l4 6-10 13L2 9Z" />
    <path d="M11 3 8 9l4 13 4-13-3-6" />
    <path d="M2 9h20" />
  </Icon>
);

const StarIcon = () => (
  <Icon>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </Icon>
);

const PersonStandingIcon = () => (
  <Icon>
    <circle cx="12" cy="5" r="1" />
    <path d="m9 20 3-6 3 6" />
    <path d="m6 8 6 2 6-2" />
    <path d="M12 10v4" />
  </Icon>
);

const MoonIcon = () => (
  <Icon>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Icon>
);

const UserIcon = () => (
  <Icon>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);

const WindIcon = () => (
  <Icon>
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </Icon>
);

const BriefcaseIcon = () => (
  <Icon>
    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    <rect width="20" height="14" x="2" y="6" rx="2" />
  </Icon>
);

const WavesIcon = () => (
  <Icon>
    <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
  </Icon>
);

const ShirtIcon = () => (
  <Icon>
    <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
  </Icon>
);

const DressIcon = () => (
  <Icon>
    <path d="M7 7c0-2.8 2.2-4.5 5-4.5S17 4.2 17 7" />
    <path d="M7 7 4 20.5 12 22l8-1.5L17 7" />
    <path d="M12 7v15" />
  </Icon>
);

const SkirtIcon = () => (
  <Icon>
    <path d="M5 7c4.5-2 9.5-2 14 0" />
    <path d="M6.5 7 9 21h6l2.5-14" />
    <path d="M12 7v14" />
  </Icon>
);

const PantsIcon = () => (
  <Icon>
    <path d="M6 3h12" />
    <path d="M7 3 6 10h12l-1-7" />
    <path d="M6 10 5 21l7-2 7 2-1-11" />
    <path d="M12 10v9" />
  </Icon>
);

function GroupIcon({ name }: { name: string }) {
  const key = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (key.includes("animalito")) return <PawPrintIcon />;
  if (key.includes("hellowen") || key.includes("halloween")) return <GhostIcon />;
  if (key.includes("accessor")) return <GemIcon />;
  if (key.includes("costume")) return <StarIcon />;
  if (key.includes("dress")) return <DressIcon />;
  if (key.includes("jumpsuit") || key.includes("bodysuit")) return <PersonStandingIcon />;
  if (key.includes("lingerie") || key.includes("sleepwear")) return <MoonIcon />;
  if (key.includes("menswear")) return <UserIcon />;
  if (key.includes("outerwear")) return <WindIcon />;
  if (key.includes("pant") || key.includes("short")) return <PantsIcon />;
  if (key.includes("shirt") || key.includes("blouse")) return <ShirtIcon />;
  if (key.includes("skirt")) return <SkirtIcon />;
  if (key.includes("suiting")) return <BriefcaseIcon />;
  if (key.includes("swim")) return <WavesIcon />;
  return <FolderIcon />;
}

const storageCache = new Map<string, Set<string>>();
const storageListeners = new Set<() => void>();
const EMPTY_SET: Set<string> = new Set();
// La caché es module-level y comparte el bundle entre todas las bibliotecas:
// se acota para que no crezca sin límite al navegar entre productos.
const MAX_CACHE_KEYS = 100;

function cacheSet(key: string, set: Set<string>) {
  storageCache.set(key, set);
  while (storageCache.size > MAX_CACHE_KEYS) {
    const oldest = storageCache.keys().next().value;
    if (oldest === undefined) break;
    storageCache.delete(oldest);
  }
}

function readStoredSet(key: string): Set<string> {
  let set = storageCache.get(key);
  if (!set) {
    set = new Set<string>();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          set = new Set(parsed.filter((s): s is string => typeof s === "string"));
        }
      }
    } catch {
      /* ignore */
    }
    cacheSet(key, set);
  }
  return set;
}

function writeStoredSet(key: string, next: Set<string>) {
  cacheSet(key, next);
  try {
    localStorage.setItem(key, JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
  storageListeners.forEach((l) => l());
}

function subscribeStored(cb: () => void) {
  const onStorage = () => {
    storageCache.clear();
    cb();
  };
  window.addEventListener("storage", onStorage);
  storageListeners.add(cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    storageListeners.delete(cb);
  };
}

function useStoredSet(
  key: string,
): [Set<string>, (updater: (prev: Set<string>) => Set<string>) => void] {
  const value = useSyncExternalStore(
    subscribeStored,
    () => readStoredSet(key),
    () => EMPTY_SET,
  );
  const set = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    writeStoredSet(key, updater(readStoredSet(key)));
  }, [key]);
  return [value, set];
}

function supportsThumbnail(file: LibraryFileRow): boolean {
  const m = (file.mimeType ?? "").toLowerCase();
  if (m === "application/pdf") return true;
  if (m.startsWith("image/") && m !== "image/svg+xml") return true;
  return (file.fileType ?? "").toLowerCase() === "pdf";
}

function isPdf(file: LibraryFileRow): boolean {
  return (
    (file.mimeType ?? "").toLowerCase() === "application/pdf" ||
    (file.fileType ?? "").toLowerCase() === "pdf"
  );
}

function isPreviewable(file: LibraryFileRow): boolean {
  const m = (file.mimeType ?? "").toLowerCase();
  if (m.startsWith("video/") || m.startsWith("audio/") || m.startsWith("image/")) return true;
  if (m === "application/pdf") return true;
  const t = (file.fileType ?? "").toLowerCase();
  return t === "video" || t === "audio" || t === "image" || t === "pdf";
}

function splitName(name: string): { breadcrumb: string; fileName: string } {
  const segments = name.split("/").filter((s) => s.trim().length > 0);
  const fileName = segments.pop() ?? name;
  return { breadcrumb: segments.join(" / "), fileName };
}

function downloadIds(ids: string[]) {
  ids.forEach((id, i) => {
    window.setTimeout(() => {
      const a = document.createElement("a");
      a.href = `/api/files/${id}/download`;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 250);
  });
}

function InstructionsModal({ onClose, title }: { onClose: () => void; title: string }) {
  const steps = [
    "Haz clic en «Descargar pack completo» para bajar todo el curso en un solo archivo ZIP. Es la forma más rápida de llevarte todos los patrones.",
    "También puedes descargarlos de a uno con el botón «Descargar» de cada tarjeta, o seleccionar varios y usar «Descargar seleccionados».",
    "Descomprime el ZIP con la app de tu dispositivo. Los patrones son PDFs imprimibles y tendrás acceso permanente mientras la compra esté activa.",
  ];
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Instrucciones"
      onClick={onClose}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>¿Cómo descargo y uso el pack de {title}?</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <XIcon />
          </button>
        </div>
        <ul className="modal-steps">
          {steps.map((text, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Viewer({ file }: { file: LibraryFileRow }) {
  const m = (file.mimeType ?? "").toLowerCase();
  const src = `/api/files/${file.id}/view`;

  if (m.startsWith("video/") || (m !== "application/pdf" && !m.startsWith("audio/") && !m.startsWith("image/") && (file.fileType ?? "").toLowerCase() === "video")) {
    return <video src={src} controls autoPlay playsInline className="viewer-frame w-full" />;
  }
  if (m.startsWith("audio/") || (m !== "application/pdf" && !m.startsWith("video/") && !m.startsWith("image/") && (file.fileType ?? "").toLowerCase() === "audio")) {
    return <audio src={src} controls autoPlay className="w-full" />;
  }
  if (m.startsWith("image/") || ((file.fileType ?? "").toLowerCase() === "image" && !m.startsWith("video/") && !m.startsWith("audio/") && m !== "application/pdf")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={file.name} className="viewer-frame mx-auto" />;
  }
  if (m === "application/pdf" || (file.fileType ?? "").toLowerCase() === "pdf") {
    return <iframe src={src} title={file.name} className="viewer-frame h-[70vh] w-full border-0" />;
  }

  return <p className="helper-text">Este tipo de archivo no se puede previsualizar aquí. Usa el botón Descargar.</p>;
}

function PatternCard({
  file,
  selected,
  favorite,
  onToggleSelect,
  onToggleFavorite,
  onView,
}: {
  file: LibraryFileRow;
  selected: boolean;
  favorite: boolean;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onView: (file: LibraryFileRow) => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const { breadcrumb, fileName } = splitName(file.name);
  const canThumb = supportsThumbnail(file);
  const previewable = isPreviewable(file);
  const size = file.sizeBytes != null ? formatFileSize(file.sizeBytes) : null;

  return (
    <li className="pattern-card">
      <div className="pattern-card-media">
        {canThumb && !thumbFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${file.id}/thumb`}
            alt={fileName}
            loading="lazy"
            decoding="async"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="card-media-fallback">
            <FileTextIcon />
          </div>
        )}
        <input
          type="checkbox"
          className="pattern-check"
          checked={selected}
          onChange={() => onToggleSelect(file.id)}
          aria-label={`Seleccionar ${fileName}`}
        />
        <button
          type="button"
          className={`card-favorite${favorite ? " is-favorite" : ""}`}
          onClick={() => onToggleFavorite(file.id)}
          aria-pressed={favorite}
          aria-label={favorite ? `Quitar ${fileName} de favoritos` : `Favorito: ${fileName}`}
        >
          <HeartIcon filled={favorite} />
        </button>
      </div>
      <div className="pattern-card-body">
        <p className="pattern-breadcrumb" title={breadcrumb}>
          {breadcrumb}
        </p>
        <h3 className="pattern-name" title={fileName}>
          {fileName}
        </h3>
        <div className="card-actions">
          {previewable && (
            <button type="button" className="outline-card-button" onClick={() => onView(file)}>
              <EyeIcon />
              {isPdf(file) ? "Ver PDF" : "Ver"}
            </button>
          )}
          <a
            href={`/api/files/${file.id}/download`}
            className="download-button"
            aria-label={`Descargar ${fileName}${size ? ` (${size})` : ""}`}
          >
            <DownloadIcon />
            Descargar
          </a>
        </div>
      </div>
    </li>
  );
}

export function FilesList({
  product,
  files,
  groups,
  userId,
}: {
  product: LibraryProduct;
  files: LibraryFileRow[];
  groups: LibraryFileGroup[];
  userId: string;
}) {
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "downloads">("recent");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [viewing, setViewing] = useState<LibraryFileRow | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  // Las claves se acotan por usuario: así los favoritos/selección NO se
  // comparten entre cuentas que usen el mismo navegador.
  const favKey = `library-favs:${userId}:${product.id}`;
  const selKey = `library-selected:${userId}:${product.id}`;
  const [favorites, setFavorites] = useStoredSet(favKey);
  const [selected, setSelected] = useStoredSet(selKey);

  // Renderizado por tandas: con +2.000 archivos no se montan todas las
  // tarjetas de golpe ni se disparan cientos de miniaturas al cargar. Se
  // muestran INITIAL_BATCH y un sentinel (IntersectionObserver) pide el
  // siguiente lote al acercarse al final.
  const INITIAL_BATCH = 42;
  const BATCH_STEP = 42;
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const listTopRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastLoadRef = useRef(0);

  const query = search.trim().toLowerCase();

  const baseRows = useMemo(
    () =>
      files.filter(
        (f) =>
          (!onlyFavorites || favorites.has(f.id)) && (!query || f.name.toLowerCase().includes(query)),
      ),
    [files, onlyFavorites, favorites, query],
  );

  const filtered = useMemo(() => {
    const rows = baseRows.filter((f) => groupId === "all" || f.groupId === groupId);
    return [...rows].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "es", { numeric: true });
      if (sortBy === "downloads") return b.downloadCount - a.downloadCount;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [baseRows, groupId, sortBy]);

  const baseCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of baseRows) {
      map.set(f.groupId, (map.get(f.groupId) ?? 0) + 1);
    }
    return map;
  }, [baseRows]);

  // Cualquier cambio de filtro/búsqueda/orden reinicia la lista al primer lote.
  // Ajuste durante render (patrón recomendado por React) para evitar el
  // setState en cascada dentro de un efecto.
  const filterKey = `${query}|${groupId}|${sortBy}|${onlyFavorites}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(INITIAL_BATCH);
  }

  // Vuelve al tope del listado solo cuando el filtro cambió de verdad.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    listTopRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [filterKey]);

  const hasMore = visibleCount < filtered.length;
  const visible = filtered.slice(0, hasMore ? visibleCount : undefined);

  const loadMore = useCallback(() => {
    const now = Date.now();
    if (now - lastLoadRef.current < 300) return;
    lastLoadRef.current = now;
    setVisibleCount((c) => Math.min(c + BATCH_STEP, filtered.length));
  }, [filtered.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const selectedCount = selected.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id));
  const someFilteredSelected = filtered.some((f) => selected.has(f.id));

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setFavorites]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelected]);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const f of filtered) next.delete(f.id);
      } else {
        for (const f of filtered) next.add(f.id);
      }
      return next;
    });
  }, [allFilteredSelected, filtered, setSelected]);

  const closeAll = useCallback(() => {
    setViewing(null);
    setShowInstructions(false);
  }, []);

  useEffect(() => {
    if (!viewing && !showInstructions) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing, showInstructions, closeAll]);

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

  const price = formatPrice(product.price, product.currency);

  return (
    <>
      <section className="product-hero">
        <div className="product-visual">
          {product.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.coverImageUrl} alt={product.title} />
          ) : (
            <div className="hero-fallback">
              <FileTextIcon />
            </div>
          )}
        </div>

        <div className="product-copy">
          <h1>{product.title}</h1>
          {price ? <p className="product-price">{price}</p> : null}
          <div className="hero-actions">
            <a className="primary-button" href={`/api/products/${product.id}/pack`}>
              <DownloadIcon />
              DESCARGAR PACK COMPLETO
            </a>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowInstructions(true)}
            >
              Ver instrucciones
            </button>
          </div>

          <div className="product-benefits">
            <div className="benefit">
              <span className="benefit-icon">
                <FileTextIcon />
              </span>
              <span>+2.000 patrones</span>
            </div>
            <div className="benefit">
              <span className="benefit-icon">
                <PrinterIcon />
              </span>
              <span>PDF imprimibles</span>
            </div>
            <div className="benefit">
              <span className="benefit-icon">
                <InfinityIcon />
              </span>
              <span>Acceso permanente</span>
            </div>
          </div>
        </div>

        <aside className="hero-note">
          <span className="hero-note-icon">
            <DownloadIcon />
          </span>
          <div>
            <strong>Recomendado:</strong> descarga el ZIP completo para guardar todo en un solo
            paso.
          </div>
        </aside>
      </section>

      <div className="library-toolbar">
        <div className="search-box">
          <SearchIcon />
          <label className="lg-sr-only" htmlFor="library-search">
            Buscar patrón
          </label>
          <input
            id="library-search"
            type="search"
            placeholder="Buscar patrón o animalito"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <label className="lg-sr-only" htmlFor="library-category">
          Filtrar por categoría
        </label>
        <select
          id="library-category"
          className="filter-select"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="all">Todas las categorías</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <label className="lg-sr-only" htmlFor="library-sort">
          Ordenar
        </label>
        <select
          id="library-sort"
          className="filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="recent">Más recientes</option>
          <option value="name">Nombre: A – Z</option>
          <option value="downloads">Más descargados</option>
        </select>

        <button
          type="button"
          className={`favorite-button${onlyFavorites ? " is-active" : ""}`}
          onClick={() => setOnlyFavorites((v) => !v)}
          aria-pressed={onlyFavorites}
        >
          <HeartIcon filled={onlyFavorites} />
          Mis favoritos
        </button>
      </div>

      <div className="library-content">
        <aside className="category-sidebar">
          <div className="category-list" role="tablist" aria-label="Filtrar por categoría">
            <button
              type="button"
              role="tab"
              aria-selected={groupId === "all"}
              className={`category-item${groupId === "all" ? " is-active" : ""}`}
              onClick={() => setGroupId("all")}
            >
              <span className="category-icon">
                <SparklesIcon />
              </span>
              <span>Todos los patrones</span>
              <span className="category-count">{baseRows.length.toLocaleString("es-CO")}</span>
              <span className="category-arrow">
                <ChevronIcon />
              </span>
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={groupId === g.id}
                className={`category-item${groupId === g.id ? " is-active" : ""}`}
                onClick={() => setGroupId(g.id)}
              >
                <span className="category-icon">
                  <GroupIcon name={g.name} />
                </span>
                <span>{g.name}</span>
                <span className="category-count">
                  {(baseCounts.get(g.id) ?? 0).toLocaleString("es-CO")}
                </span>
                <span className="category-arrow">
                  <ChevronIcon />
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="pattern-area" aria-label="Patrones">
          <div className="pattern-header" ref={listTopRef}>
            <div className="pattern-title">
              <h2>Explora tus patrones</h2>
              <span className="file-count">
                {files.length.toLocaleString("es-CO")} archivos
              </span>
            </div>
            <div className="pattern-actions">
              <label className="select-all">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  aria-label="Seleccionar todos los patrones visibles"
                />
                Seleccionar todos
              </label>
              <button
                type="button"
                className="outline-button"
                disabled={selectedCount === 0}
                onClick={() => downloadIds([...selected])}
              >
                <DownloadIcon />
                Descargar seleccionados ({selectedCount.toLocaleString("es-CO")})
              </button>
            </div>
            <p className="helper-text">Descarga individual o selecciona varios</p>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon icon icon-lg">
                <FolderSearchIcon />
              </span>
              <p>
                No encontramos patrones con esa búsqueda. Prueba con otro término o cambia de
                categoría.
              </p>
            </div>
          ) : (
            <>
              <ul className="pattern-grid">
                {visible.map((f) => (
                  <PatternCard
                    key={f.id}
                    file={f}
                    selected={selected.has(f.id)}
                    favorite={favorites.has(f.id)}
                    onToggleSelect={toggleSelect}
                    onToggleFavorite={toggleFavorite}
                    onView={setViewing}
                  />
                ))}
              </ul>

              {hasMore ? (
                <div className="load-more-bar" ref={sentinelRef}>
                  <button type="button" className="outline-button" onClick={loadMore}>
                    Mostrar más ({filtered.length - visibleCount} restantes)
                  </button>
                  <span className="helper-text">
                    Mostrando {(visibleCount).toLocaleString("es-CO")} de{" "}
                    {filtered.length.toLocaleString("es-CO")}
                  </span>
                </div>
              ) : visibleCount > INITIAL_BATCH ? (
                <p className="helper-text load-more-bar">
                  Mostrando los {filtered.length.toLocaleString("es-CO")} archivos.
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      {showInstructions ? (
        <InstructionsModal title={product.title} onClose={() => setShowInstructions(false)} />
      ) : null}

      {viewing ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={viewing.name}
          onClick={closeAll}
        >
          <div className="modal-panel modal-viewer" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 title={viewing.name}>{viewing.name}</h3>
              <button type="button" className="modal-close" onClick={closeAll} aria-label="Cerrar">
                <XIcon />
              </button>
            </div>
            <Viewer file={viewing} />
          </div>
        </div>
      ) : null}
    </>
  );
}