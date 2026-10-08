"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { saveLandingSection } from "@/lib/server/actions/landing";
import { LANDING_THEMES } from "@/lib/constants";
import {
  LANDING_FONTS,
  LANDING_FONT_CATEGORIES,
  getLandingFont,
} from "@/lib/landing-fonts";
import {
  LANDING_SECTION_LABELS,
  LANDING_WIZARD_SECTIONS,
  type LandingSection,
  type LandingSectionData,
} from "@/types/landing";
import { AutosaveField } from "@/app/admin/_components/autosave-field";

type ItemFieldSpec = {
  key: string;
  label: string;
  type: "text" | "textarea" | "lines" | "select" | "font" | "number";
  placeholder?: string;
  /** Obligatorio si el elemento tiene algún dato (validación en el cliente). */
  required?: boolean;
};

type ProductOption = { slug: string; title: string; status: string; theme: string };

type SaveResult = { ok: boolean; error?: string };
type ItemSaveState = { kind: "saving" | "saved" | "error"; message?: string };

type SectionConfig = {
  section: LandingSection;
  description: string;
  hideBaseFields?: boolean;
  extraFields?: ItemFieldSpec[];
  items?: ItemFieldSpec[];
  fieldGroups?: { label: string; fields: string[] }[];
};

const CONFIGS: SectionConfig[] = [
  {
    section: "hero",
    description: "Bloque principal con el titular, subtítulo y llamado a la acción.",
    extraFields: [
      { key: "badge", label: "Etiqueta", type: "text", placeholder: "Nuevo" },
      { key: "ctaText", label: "Texto del botón", type: "text", placeholder: "Ver el pack" },
    ],
    fieldGroups: [
      { label: "Titular y etiqueta", fields: ["@base", "badge"] },
      { label: "Botón principal", fields: ["ctaText"] },
    ],
  },
  {
    section: "benefits",
    description: "Los beneficios del pack.",
    extraFields: [{ key: "eyebrow", label: "Cintillo (eyebrow)", type: "text" }],
    items: [
      { key: "title", label: "Título", type: "text", required: true },
      { key: "description", label: "Descripción", type: "textarea" },
    ],
    fieldGroups: [
      { label: "Titular y cintillo", fields: ["@base", "eyebrow"] },
      { label: "Lista de beneficios", fields: ["@items"] },
    ],
  },
  {
    section: "content",
    description: "Qué incluye el pack (lista con checkmarks).",
    extraFields: [{ key: "eyebrow", label: "Cintillo (eyebrow)", type: "text" }],
    items: [
      { key: "title", label: "Título", type: "text", required: true },
      { key: "description", label: "Descripción", type: "textarea" },
    ],
    fieldGroups: [
      { label: "Titular y cintillo", fields: ["@base", "eyebrow"] },
      { label: "Qué incluye · lista", fields: ["@items"] },
    ],
  },
  {
    section: "bonuses",
    description: "Bonos u ofertas especiales.",
    extraFields: [{ key: "eyebrow", label: "Cintillo (eyebrow)", type: "text" }],
    items: [
      { key: "title", label: "Título", type: "text", required: true },
      { key: "description", label: "Descripción", type: "textarea" },
    ],
    fieldGroups: [
      { label: "Titular y cintillo", fields: ["@base", "eyebrow"] },
      { label: "Lista de bonos", fields: ["@items"] },
    ],
  },
  {
    section: "testimonials",
    description: "Testimonios de clientes.",
    extraFields: [{ key: "eyebrow", label: "Cintillo (eyebrow)", type: "text" }],
    items: [
      { key: "author", label: "Autor", type: "text", required: true },
      { key: "role", label: "Rol", type: "text", placeholder: "Costurera" },
      { key: "quote", label: "Cita", type: "textarea", required: true },
      { key: "rating", label: "Estrellas (1-5)", type: "number", placeholder: "5" },
    ],
    fieldGroups: [
      { label: "Titular y cintillo", fields: ["@base", "eyebrow"] },
      { label: "Lista de testimonios", fields: ["@items"] },
    ],
  },
  {
    section: "faq",
    description: "Preguntas frecuentes (acordeón).",
    extraFields: [{ key: "eyebrow", label: "Cintillo (eyebrow)", type: "text" }],
    items: [
      { key: "question", label: "Pregunta", type: "text", required: true },
      { key: "answer", label: "Respuesta", type: "textarea", required: true },
    ],
    fieldGroups: [
      { label: "Titular y cintillo", fields: ["@base", "eyebrow"] },
      { label: "Preguntas · lista", fields: ["@items"] },
    ],
  },
  {
    section: "cta",
    description: "Cierre con llamado a la acción.",
    extraFields: [
      { key: "eyebrow", label: "Cintillo (eyebrow)", type: "text" },
      { key: "ctaText", label: "Texto del botón", type: "text", placeholder: "Comprar ahora" },
    ],
    fieldGroups: [
      { label: "Titular y cintillo", fields: ["@base", "eyebrow"] },
      { label: "Botón final", fields: ["ctaText"] },
    ],
  },
  {
    section: "site",
    description:
      "Textos globales de la landing (ticker, sellos de confianza, precios del ticket, header y footer). Cada línea = un elemento.",
    hideBaseFields: true,
    extraFields: [
      { key: "featuredProductSlug", label: "Producto destacado (estelar)", type: "select", placeholder: "Selecciona un producto" },
      { key: "titleFont", label: "Tipografía de titulares y precios", type: "font" },
      { key: "tickerItems", label: "Ticker (1 por línea)", type: "lines" },
      { key: "trustRows", label: "Sellos de confianza de la cabecera (1 por línea)", type: "lines" },
      { key: "patternChips", label: "Chips de la hoja de molde (1 por línea)", type: "lines" },
      { key: "heroSecondaryCtaText", label: "Texto botón secundario del hero", type: "text" },
      { key: "heroPriceKicker", label: "Kicker del precio (hero)", type: "text" },
      { key: "heroPriceNote", label: "Nota del precio (hero)", type: "text" },
      { key: "bonusTag", label: "Etiqueta de los bonos", type: "text" },
      { key: "ctaPriceKicker", label: "Kicker del precio (CTA final)", type: "text" },
      { key: "ctaPriceNote", label: "Nota del precio (CTA final)", type: "text" },
      { key: "ctaFootnote", label: "Nota al pie del CTA final", type: "text" },
      { key: "headerTag", label: "Cabecera · etiqueta (descripción SEO)", type: "text" },
      { key: "footerBadges", label: "Footer · sellos (1 por línea)", type: "lines" },
    ],
    fieldGroups: [
      { label: "Producto destacado", fields: ["featuredProductSlug"] },
      { label: "Tipografía", fields: ["titleFont"] },
      { label: "Ticker y sellos", fields: ["tickerItems", "trustRows", "patternChips"] },
      { label: "Precio del hero", fields: ["heroPriceKicker", "heroPriceNote", "heroSecondaryCtaText"] },
      { label: "Precio del CTA final y bonos", fields: ["bonusTag", "ctaPriceKicker", "ctaPriceNote", "ctaFootnote"] },
      { label: "Cabecera y footer", fields: ["headerTag", "footerBadges"] },
    ],
  },
];

type Step = {
  section: LandingSection;
  config: SectionConfig;
};

const STEPS: Step[] = LANDING_WIZARD_SECTIONS.map((section) => ({
  section,
  config: CONFIGS.find((c) => c.section === section)!,
}));

const SECTION_ANCHORS: Partial<Record<LandingSection, string>> = {
  site: "",
  hero: "hero",
  benefits: "beneficios",
  content: "contenido",
  bonuses: "bonos",
  testimonials: "testimonios",
  faq: "faq",
  cta: "comprar",
};

const DEVICES = [
  { value: "desktop", label: "Escritorio" },
  { value: "tablet", label: "Tablet" },
  { value: "mobile", label: "Móvil" },
] as const;

const DEVICE_WIDTHS: Record<"desktop" | "tablet" | "mobile", string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

const baseInput =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

/** Identificador estable por elemento de lista. No se renderiza: solo da a
 *  React una clave única aunque dos elementos compartan el mismo texto (así
 *  "Duplicar" no colapsa el duplicado). Los elementos guardados antes de esta
 *  función no tienen `id`; se les asigna uno al abrirlos en el editor. */
function newItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `it-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function ItemsEditor({
  sectionId,
  spec,
  items,
  onChange,
  onSave,
  emptyMessage,
}: {
  /** Sección del CRM: da un `id` estable a cada campo para el enfoque en línea. */
  sectionId: string;
  spec: ItemFieldSpec[];
  items: Array<Record<string, string>>;
  onChange: (items: Array<Record<string, string>>) => void;
  onSave: (items: Array<Record<string, string>>) => Promise<SaveResult>;
  emptyMessage: string;
}) {
  const [status, setStatus] = useState<Record<string, ItemSaveState>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const t of Object.values(all)) window.clearTimeout(t);
    };
  }, []);

  const patch = (i: number, key: string, value: string) => {
    const next = items.map((item, idx) => (idx === i ? { ...item, [key]: value } : item));
    onChange(next);
    return next;
  };

  // Un elemento totalmente vacío no se valida (aún no se guarda). En cuanto
  // tiene algún dato, sus campos obligatorios deben estar completos.
  const missingRequired = (item: Record<string, string>) => {
    const isBlank = spec.every((f) => (item[f.key] ?? "").trim() === "");
    if (isBlank) return [];
    return spec
      .filter((f) => f.required && (item[f.key] ?? "").trim() === "")
      .map((f) => f.key);
  };

  const markStatus = (id: string, next: ItemSaveState | null) => {
    if (timers.current[id]) window.clearTimeout(timers.current[id]);
    setStatus((prev) => {
      const copy = { ...prev };
      if (next) copy[id] = next;
      else delete copy[id];
      return copy;
    });
    if (next?.kind === "saved") {
      timers.current[id] = window.setTimeout(() => markStatus(id, null), 2600);
    }
  };

  const commit = (next: Array<Record<string, string>>, id: string) => {
    markStatus(id, { kind: "saving" });
    Promise.resolve(onSave(next)).then(
      (res) => {
        if (res.ok) {
          setFieldErrors((prev) => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
          markStatus(id, { kind: "saved" });
        } else {
          markStatus(id, { kind: "error", message: res.error ?? "No se pudo guardar." });
        }
      },
      () => markStatus(id, { kind: "error", message: "No se pudo guardar." }),
    );
  };

  const handleChange = (i: number, key: string, value: string) => {
    const next = patch(i, key, value);
    const id = next[i].id ?? String(i);
    if ((fieldErrors[id]?.length ?? 0) > 0) {
      const missing = missingRequired(next[i]);
      setFieldErrors((prev) => ({ ...prev, [id]: missing }));
    }
  };

  const handleBlur = (i: number, key: string, value: string) => {
    const next = patch(i, key, value);
    const id = next[i].id ?? String(i);
    const missing = missingRequired(next[i]);
    setFieldErrors((prev) => ({ ...prev, [id]: missing }));
    // No se guarda hasta corregir: evita el error genérico del servidor y deja
    // el aviso junto al campo que falta.
    if (missing.length > 0) return;
    void commit(next, id);
  };

  const add = () => {
    // Solo en local: un ítem en blanco no debe guardarse ni disparar la
    // validación del servidor. Se persiste al completarlo (blur) o al guardar
    // cualquier otro cambio de la sección.
    const blank: Record<string, string> = { id: newItemId() };
    for (const f of spec) blank[f.key] = "";
    onChange([...items, blank]);
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next);
    void onSave(next);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    void onSave(next);
  };

  const duplicate = (i: number) => {
    const next = [
      ...items.slice(0, i + 1),
      { ...items[i], id: newItemId() },
      ...items.slice(i + 1),
    ];
    onChange(next);
    void onSave(next);
  };

  return (
    <div className="space-y-4">
      {items.map((item, i) => {
        const itemId = item.id ?? String(i);
        const st = status[itemId];
        const errs = fieldErrors[itemId] ?? [];
        return (
          <div
            key={itemId}
            className="space-y-3 rounded-md border border-border bg-background p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Elemento {i + 1}
              </span>
              {st ? (
                <span
                  role={st.kind === "error" ? "alert" : "status"}
                  aria-live="polite"
                  className={`text-xs ${
                    st.kind === "error"
                      ? "text-destructive"
                      : st.kind === "saved"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {st.kind === "saving"
                    ? "Guardando…"
                    : st.kind === "saved"
                      ? "✓ Guardado"
                      : st.message}
                </span>
              ) : null}
            </div>
            <div className="grid gap-3">
            {spec.map((field) => {
              const invalid = errs.includes(field.key);
              const fieldId = `sf-item-${sectionId}-${i}-${field.key}`;
              const errId = `${fieldId}-error`;
              const controlProps = {
                id: fieldId,
                value: item[field.key] ?? "",
                placeholder: field.placeholder,
                "aria-invalid": invalid || undefined,
                "aria-describedby": invalid ? errId : undefined,
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  handleChange(i, field.key, e.target.value),
                onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  handleBlur(i, field.key, e.target.value),
                className: `${baseInput}${invalid ? " border-destructive" : ""}`,
              };
              return (
                <label key={field.key} className="space-y-1">
                  <span className="text-sm font-medium">{field.label}</span>
                  {field.type === "textarea" ? (
                    <textarea {...controlProps} rows={3} />
                  ) : field.type === "number" ? (
                    <input {...controlProps} type="number" min={1} max={5} />
                  ) : (
                    <input {...controlProps} type="text" />
                  )}
                  {invalid ? (
                    <span id={errId} className="text-xs text-destructive">
                      Este campo es obligatorio.
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Subir elemento"
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label="Bajar elemento"
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => duplicate(i)}
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
              >
                Duplicar
              </button>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-sm text-destructive hover:underline"
            >
              Quitar elemento
            </button>
          </div>
          </div>
        );
      })}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        + Añadir elemento
      </button>
    </div>
  );
}

function SectionForm({
  step,
  section,
  products,
  isPublished,
  onTogglePublished,
  focusReq,
  onFocusDone,
  onSaved,
}: {
  step: Step;
  section: LandingSectionData;
  products: ProductOption[];
  isPublished: boolean;
  onTogglePublished: (value: boolean) => void;
  focusReq: { section: string; group: string | null; elementId: string } | null;
  onFocusDone: () => void;
  onSaved: () => void;
}) {
  const config = step.config;

  const initialContent = section.content as Record<string, unknown>;
  const [title, setTitle] = useState(section.title);
  const [subtitle, setSubtitle] = useState(section.subtitle);

  const [extra, setExtra] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of config.extraFields ?? []) {
      const v = initialContent[f.key];
      out[f.key] = Array.isArray(v) ? v.join("\n") : String(v ?? "");
    }
    return out;
  });
  const [items, setItems] = useState<Array<Record<string, string>>>(() => {
    const raw = initialContent["items"];
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Record<string, unknown>>).map((item) => {
      const out: Record<string, string> = {
        id: typeof item.id === "string" && item.id ? item.id : newItemId(),
      };
      for (const f of config.items ?? []) out[f.key] = String(item[f.key] ?? "");
      return out;
    });
  });

  const [manualGroup, setManualGroup] = useState<string | null>(
    config.fieldGroups?.[0]?.label ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  // Grupo abierto: si el preview pidió enfocar un campo de esta sección, gana
  // ese grupo; el usuario puede abrir/cerrar otro (lo que limpia el pedido).
  const focusGroup = focusReq && focusReq.section === section.section ? focusReq.group : null;
  const openGroup = focusGroup ?? manualGroup;

  const toggleGroup = (label: string) => {
    onFocusDone();
    setManualGroup(openGroup === label ? null : label);
  };

  const patchExtra = (key: string, value: string) => {
    setExtra((prev) => ({ ...prev, [key]: value }));
  };

  // Enfoque pedido desde el preview: cuando el grupo ya está abierto (derivado
  // arriba), enfoca el campo. Solo toca el DOM, no estado.
  useEffect(() => {
    if (!focusReq || focusReq.section !== section.section) return;
    const t = window.setTimeout(() => {
      document.getElementById(focusReq.elementId)?.focus();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq]);

  const persist = async (
    overrides?: {
      title?: string;
      subtitle?: string;
      isPublished?: boolean;
      extra?: Record<string, string>;
      items?: Array<Record<string, string>>;
    },
  ) => {
    const extraNow = overrides?.extra ?? extra;
    const itemsNow = overrides?.items ?? items;
    // Los ítems totalmente vacíos no se envían: evita el error de validación al
    // pulsar "+ Añadir elemento" y no ensucia la BD con filas en blanco.
    const itemsSpec = config.items;
    const itemsToSave = itemsSpec
      ? itemsNow.filter((it) => itemsSpec.some((f) => (it[f.key] ?? "").trim() !== ""))
      : [];
    const content: Record<string, unknown> = itemsSpec ? { items: itemsToSave } : {};
    for (const field of config.extraFields ?? []) {
      const raw = extraNow[field.key] ?? "";
      content[field.key] =
        field.type === "lines"
          ? raw
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : raw;
    }
    const res = await saveLandingSection(section.section, {
      title: config.hideBaseFields ? "" : (overrides?.title ?? title),
      subtitle: config.hideBaseFields ? "" : (overrides?.subtitle ?? subtitle),
      isPublished: overrides?.isPublished ?? isPublished,
      content,
    });
    if (res.ok) {
      setError(null);
      onSaved();
    } else {
      setError(res.error ?? "No se pudo guardar la sección.");
    }
    return res;
  };

  const renderBaseFields = () => (
    <>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Título</span>
        <AutosaveField
          id={`sf-field-${section.section}-title`}
          value={title}
          onChangeText={setTitle}
          onSave={async (v) => {
            setTitle(v);
            return persist({ title: v });
          }}
          className={baseInput}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Subtítulo</span>
        <AutosaveField
          id={`sf-field-${section.section}-subtitle`}
          as="textarea"
          rows={2}
          value={subtitle}
          onChangeText={setSubtitle}
          onSave={async (v) => {
            setSubtitle(v);
            return persist({ subtitle: v });
          }}
          className={baseInput}
        />
      </label>
    </>
  );

  const renderGroupField = (key: string) => {
    if (key === "@base") {
      if (config.hideBaseFields) return null;
      return renderBaseFields();
    }
    if (key === "@items") {
      if (!config.items) return null;
      return (
        <ItemsEditor
          sectionId={section.section}
          spec={config.items}
          items={items}
          onChange={setItems}
          onSave={(next) => persist({ items: next })}
          emptyMessage="Esta sección no tiene elementos todavía."
        />
      );
    }
    const field = config.extraFields?.find((f) => f.key === key);
    return field ? renderExtraField(field) : null;
  };

  const renderExtraField = (field: ItemFieldSpec) => {
    if (field.type === "select") {
      const current = extra[field.key] ?? "";
      const isInvalid = current !== "" && !products.some((p) => p.slug === current);
      const statusLabel = (s: string) =>
        s === "published" ? "publicado" : s === "draft" ? "borrador" : "archivado";
      return (
        <div key={field.key} className="space-y-1">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{field.label}</span>
            <AutosaveField
              id={`sf-field-${section.section}-${field.key}`}
              as="select"
              value={current}
              saveOnChange
              onChangeText={(v) => patchExtra(field.key, v)}
              onSave={async (v) => {
                patchExtra(field.key, v);
                return persist({ extra: { ...extra, [field.key]: v } });
              }}
              className={`${baseInput} ${isInvalid ? "border-amber-400" : ""}`}
            >
              <option value="">Sin selección (landing sin producto estelar)</option>
              {products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title} · {statusLabel(p.status)} · tema {LANDING_THEMES.find((t) => t.value === p.theme)?.label ?? p.theme}
                </option>
              ))}
              {isInvalid ? (
                <option value={current} disabled>
                  {current} (producto no encontrado)
                </option>
              ) : null}
            </AutosaveField>
          </label>
          {isInvalid ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Ese slug ya no existe en Productos. Elige otro curso.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Se listan todos los cursos (publicados, borradores y archivados). El tema de la landing
            se toma del producto seleccionado siempre; el precio, la portada, el hero y el botón de
            compra solo aparecen si el curso está publicado.
          </p>
        </div>
      );
    }
    if (field.type === "font") {
      const current = extra[field.key] ?? "";
      const selected = getLandingFont(current);
      return (
        <div key={field.key} className="space-y-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{field.label}</span>
            <AutosaveField
              id={`sf-field-${section.section}-${field.key}`}
              as="select"
              value={current}
              saveOnChange
              onChangeText={(v) => patchExtra(field.key, v)}
              onSave={async (v) => {
                patchExtra(field.key, v);
                return persist({ extra: { ...extra, [field.key]: v } });
              }}
              className={baseInput}
            >
              <option value="">Automática (según el tema)</option>
              {LANDING_FONT_CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {LANDING_FONTS.filter((f) => f.category === cat).map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </AutosaveField>
          </label>
          <div className="rounded-lg border border-border bg-[#0a0d13] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-white/50">Vista previa</p>
            <p
              className="mt-1 text-2xl uppercase leading-none text-[#f4f2ec]"
              style={{
                fontFamily: selected?.stack ?? 'var(--font-archivo-black), "Archivo Black", sans-serif',
                fontWeight: selected?.weight ?? 400,
                letterSpacing: selected?.tracking ?? "-0.015em",
              }}
            >
              Pack de moldes <span style={{ color: "#18ff00" }}>premium</span>
            </p>
            <p className="mt-1 text-[11px] text-white/50">
              {selected ? selected.note : "El tema aplica su fuente por defecto."}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Se aplica a titulares y elementos destacados (precio del ticket, hoja de molde). Los
            párrafos conservan su fuente.
          </p>
        </div>
      );
    }
    return (
      <label key={field.key} className="block space-y-1">
        <span className="text-sm font-medium">{field.label}</span>
        {field.type === "lines" ? (
          <AutosaveField
            id={`sf-field-${section.section}-${field.key}`}
            as="textarea"
            rows={5}
            value={extra[field.key] ?? ""}
            placeholder={field.placeholder}
            onChangeText={(v) => patchExtra(field.key, v)}
            onSave={async (v) => {
              patchExtra(field.key, v);
              return persist({ extra: { ...extra, [field.key]: v } });
            }}
            className={`${baseInput} font-mono`}
          />
        ) : (
          <AutosaveField
            id={`sf-field-${section.section}-${field.key}`}
            value={extra[field.key] ?? ""}
            placeholder={field.placeholder}
            onChangeText={(v) => patchExtra(field.key, v)}
            onSave={async (v) => {
              patchExtra(field.key, v);
              return persist({ extra: { ...extra, [field.key]: v } });
            }}
            className={baseInput}
          />
        )}
      </label>
    );
  };

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {config.extraFields ? (
        config.fieldGroups ? (
          <div className="space-y-2">
            {config.fieldGroups.map((group) => {
              const isOpen = openGroup === group.label;
              return (
                <div
                  key={group.label}
                  className="overflow-hidden rounded-md border border-border"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium transition-colors ${
                      isOpen
                        ? "bg-muted text-foreground"
                        : "text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span>{group.label}</span>
                    <span
                      className={`shrink-0 text-base leading-none text-muted-foreground transition-transform ${
                        isOpen ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-3 border-t border-border p-3">
                      {group.fields.map((key) => (
                        <Fragment key={key}>{renderGroupField(key)}</Fragment>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {config.extraFields.map((field) => renderExtraField(field))}
          </div>
        )
      ) : null}


      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => {
            onTogglePublished(e.target.checked);
            void persist({ isPublished: e.target.checked });
          }}
          className="h-4 w-4 rounded border-input text-primary"
        />
        Sección publicada en la landing
      </label>
    </div>
  );
}

function LandingWizard({ allSections, products, initialStep }: { allSections: LandingSectionData[]; products: ProductOption[]; initialStep: number }) {
  const router = useRouter();
  const [current, setCurrent] = useState(initialStep);
  const [flash, setFlash] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [interactive, setInteractive] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  // Estado de publicación local por sección: al togglear "publicada" las props
  // del servidor no se refrescan hasta cambiar de paso, así que el badge leía
  // un valor viejo. Aquí queda sincronizado de inmediato.
  const [published, setPublished] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allSections.map((s) => [s.section, s.isPublished])),
  );
  // Pedido de enfoque desde el preview (clic en un campo con `data-sf-edit`).
  const [focusReq, setFocusReq] = useState<{
    section: string;
    group: string | null;
    elementId: string;
  } | null>(null);
  const flashTimer = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const step = STEPS[current];
  const section = allSections.find((s) => s.section === step.section) ?? {
    section: step.section,
    title: "",
    subtitle: "",
    content: {},
    isPublished: true,
  };
  const previewHref =
    step.section === "site" || step.section === "hero" ? "/" : "/que-incluye";
  const isPublishedNow = published[step.section] ?? section.isPublished;

  // El editor habla con la landing embebida por `postMessage` (origen validado
  // en el puente). Así no depende de `contentDocument`, que solo funciona con el
  // preview en el mismo origen.
  const postToPreview = (message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  };

  const scrollPreviewTo = (anchor: string) => {
    postToPreview({ type: "sf:scroll", anchor });
  };

  const performJump = (i: number) => {
    const url = `/admin/landing?step=${STEPS[i].section}`;
    setCurrent(i);
    router.replace(url);
    window.setTimeout(() => scrollPreviewTo(SECTION_ANCHORS[STEPS[i].section] ?? ""), 150);
  };

  const goTo = (i: number) => {
    if (i < 0 || i >= STEPS.length || i === current) return;
    performJump(i);
  };

  // Clic en el preview (data-sf-edit): salta a la sección, abre el grupo del
  // campo y lo enfoca. Formato: "<sección>.<campo>" o
  // "<sección>.items.<índice>.<campo>".
  const focusField = (field: string) => {
    const [sec, seg1, seg2, seg3] = field.split(".");
    const stepIndex = STEPS.findIndex((s) => s.section === sec);
    if (stepIndex < 0 || !seg1) return;

    const config = CONFIGS.find((c) => c.section === sec);
    let group: string | null = null;
    let elementId = `sf-field-${sec}-${seg1}`;
    if (seg1 === "items") {
      elementId = `sf-item-${sec}-${seg2}-${seg3}`;
      group = config?.fieldGroups?.find((g) => g.fields.includes("@items"))?.label ?? null;
    } else {
      group =
        config?.fieldGroups?.find(
          (g) =>
            g.fields.includes(seg1) ||
            (g.fields.includes("@base") && (seg1 === "title" || seg1 === "subtitle")),
        )?.label ?? null;
    }

    if (stepIndex !== current) performJump(stepIndex);
    setFocusReq({ section: sec, group, elementId });
  };

  useEffect(() => {
    if (initialStep === current || initialStep < 0 || initialStep >= STEPS.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    performJump(initialStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStep]);

  useEffect(() => {
    const t = flashTimer.current;
    return () => {
      if (t) window.clearTimeout(t);
    };
  }, []);

  // Mensajes del puente: "sf:ready" alinea el scroll con la sección editada y
  // "sf:focus" (clic en el preview) salta al campo correspondiente.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; field?: string } | null;
      if (data?.type === "sf:ready") {
        scrollPreviewTo(SECTION_ANCHORS[step.section] ?? "");
        return;
      }
      if (data?.type === "sf:focus" && typeof data.field === "string") {
        focusField(data.field);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.section, current]);

  const onSaved = () => {
    // `router.refresh()` en el puente re-renderiza los Server Components sin
    // recargar el iframe: conserva el scroll y el estado cliente.
    postToPreview({ type: "sf:refresh" });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlash(`«${LANDING_SECTION_LABELS[step.section]}»: cambios guardados.`);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3200);
  };

  return (
    <div className="mt-2 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* En pantallas < xl no caben editor y preview a la vez. */}
      <div className="flex gap-1 rounded-md bg-secondary p-1 text-sm xl:hidden">
        {(["edit", "preview"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPane(p)}
            className={`flex-1 rounded-sm px-3 py-1.5 transition-colors ${
              pane === p ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            {p === "edit" ? "Editor" : "Vista previa"}
          </button>
        ))}
      </div>

      <div className={`rounded-lg border border-border bg-card p-6 ${pane === "edit" ? "" : "hidden xl:block"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              {LANDING_SECTION_LABELS[step.section]}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.config.description}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isPublishedNow
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPublishedNow ? "bg-emerald-500" : "bg-muted-foreground"
              }`}
            />
            {isPublishedNow ? "Publicada" : "Oculta"}
          </span>
        </div>

        <div className="mt-4">
          {flash ? (
            <div
              role="status"
              aria-live="polite"
              className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400"
            >
              <span className="font-semibold">✓</span> {flash}
            </div>
          ) : null}
          <SectionForm
            key={step.section}
            step={step}
            section={section}
            products={products}
            isPublished={isPublishedNow}
            onTogglePublished={(value) =>
              setPublished((prev) => ({ ...prev, [step.section]: value }))
            }
            focusReq={focusReq}
            onFocusDone={() => setFocusReq(null)}
            onSaved={onSaved}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-xs text-muted-foreground">
            Paso {current + 1} de {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={current === STEPS.length - 1}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
              current === STEPS.length - 1
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            Siguiente →
          </button>
        </div>
      </div>

      <div className={`overflow-hidden rounded-lg border border-border bg-card ${pane === "preview" ? "" : "hidden xl:block"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            Vista previa
            <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              Mostrando · {LANDING_SECTION_LABELS[step.section]}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-md bg-secondary p-0.5 sm:flex">
              {DEVICES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDevice(d.value)}
                  aria-pressed={device === d.value}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    device === d.value
                      ? "bg-card shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setInteractive((v) => !v)}
              aria-pressed={interactive}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              {interactive ? "Bloquear clics" : "Permitir clics"}
            </button>
            <a
              href={previewHref}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Abrir ↗
            </a>
          </div>
        </div>

        <div className="flex justify-center bg-muted">
          <div className="relative" style={{ width: DEVICE_WIDTHS[device], maxWidth: "100%" }}>
            <iframe
              ref={iframeRef}
              src={previewHref}
              title="Vista previa de la landing"
              className="w-full border-0 bg-white"
              style={{ height: "calc(100vh - 9rem)" }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
            {!interactive ? (
              <button
                type="button"
                onClick={() => setInteractive(true)}
                aria-label="Activar interacción en la vista previa"
                title="Vista previa bloqueada para no disparar enlaces de compra. Clic para interactuar."
                className="absolute inset-0 cursor-pointer bg-transparent"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingEditor({
  sections,
  products,
  initialStep,
}: {
  sections: LandingSectionData[];
  products: ProductOption[];
  initialStep: number;
}) {
  return (
    <div className="-mt-6">
      <LandingWizard allSections={sections} products={products} initialStep={initialStep} />
    </div>
  );
}