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
  type: "text" | "textarea" | "lines" | "select" | "font";
  placeholder?: string;
};

type ProductOption = { slug: string; title: string; status: string; theme: string };

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
      { key: "title", label: "Título", type: "text" },
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
      { key: "title", label: "Título", type: "text" },
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
      { key: "title", label: "Título", type: "text" },
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
      { key: "author", label: "Autor", type: "text" },
      { key: "role", label: "Rol", type: "text", placeholder: "Costurera" },
      { key: "quote", label: "Cita", type: "textarea" },
      { key: "rating", label: "Estrellas (1-5)", type: "text", placeholder: "5" },
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
      { key: "question", label: "Pregunta", type: "text" },
      { key: "answer", label: "Respuesta", type: "textarea" },
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
      { key: "trustRows", label: "Sellos de confianza del hero (1 por línea)", type: "lines" },
      { key: "patternChips", label: "Chips de la hoja de molde (1 por línea)", type: "lines" },
      { key: "heroSecondaryCtaText", label: "Texto botón secundario del hero", type: "text" },
      { key: "heroPriceKicker", label: "Kicker del precio (hero)", type: "text" },
      { key: "heroPriceNote", label: "Nota del precio (hero)", type: "text" },
      { key: "bonusTag", label: "Etiqueta de los bonos", type: "text" },
      { key: "ctaPriceKicker", label: "Kicker del precio (CTA final)", type: "text" },
      { key: "ctaPriceNote", label: "Nota del precio (CTA final)", type: "text" },
      { key: "ctaFootnote", label: "Nota al pie del CTA final", type: "text" },
      { key: "headerBadge", label: "Cabecera · sello de confianza", type: "text" },
      { key: "headerTag", label: "Cabecera · etiqueta", type: "text" },
      { key: "footerBadges", label: "Footer · sellos (1 por línea)", type: "lines" },
    ],
    fieldGroups: [
      { label: "Producto destacado", fields: ["featuredProductSlug"] },
      { label: "Tipografía", fields: ["titleFont"] },
      { label: "Ticker y sellos", fields: ["tickerItems", "trustRows", "patternChips"] },
      { label: "Precio del hero", fields: ["heroPriceKicker", "heroPriceNote", "heroSecondaryCtaText"] },
      { label: "Precio del CTA final y bonos", fields: ["bonusTag", "ctaPriceKicker", "ctaPriceNote", "ctaFootnote"] },
      { label: "Cabecera y footer", fields: ["headerBadge", "headerTag", "footerBadges"] },
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

const baseInput =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function ItemsEditor({
  spec,
  initialItems,
  onChange,
  onSave,
  emptyMessage,
}: {
  spec: ItemFieldSpec[];
  initialItems: Array<Record<string, string>>;
  onChange: (items: Array<Record<string, string>>) => void;
  onSave: (items: Array<Record<string, string>>) => void;
  emptyMessage: string;
}) {
  const [items, setItems] = useState<Array<Record<string, string>>>(initialItems);

  const update = (next: Array<Record<string, string>>) => {
    setItems(next);
    onChange(next);
  };

  const patch = (i: number, key: string, value: string) => {
    const next = items.map((item, idx) => (idx === i ? { ...item, [key]: value } : item));
    update(next);
    return next;
  };

  const add = () => {
    const blank = Object.fromEntries(spec.map((f) => [f.key, ""])) as Record<string, string>;
    const next = [...items, blank];
    update(next);
    onSave(next);
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    update(next);
    onSave(next);
  };

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="space-y-3 rounded-md border border-border bg-background p-4">
          <div className="grid gap-3">
            {spec.map((field) =>
              field.type === "textarea" ? (
                <label key={field.key} className="space-y-1">
                  <span className="text-sm font-medium">{field.label}</span>
                  <textarea
                    rows={3}
                    value={item[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => patch(i, field.key, e.target.value)}
                    onBlur={(e) => onSave(patch(i, field.key, e.target.value))}
                    className={baseInput}
                  />
                </label>
              ) : (
                <label key={field.key} className="space-y-1">
                  <span className="text-sm font-medium">{field.label}</span>
                  <input
                    type="text"
                    value={item[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => patch(i, field.key, e.target.value)}
                    onBlur={(e) => onSave(patch(i, field.key, e.target.value))}
                    className={baseInput}
                  />
                </label>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-sm text-destructive hover:underline"
          >
            Quitar elemento
          </button>
        </div>
      ))}
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
  onSaved,
}: {
  step: Step;
  section: LandingSectionData;
  products: ProductOption[];
  onSaved: () => void;
}) {
  const config = step.config;

  const initialContent = section.content as Record<string, unknown>;
  const [title, setTitle] = useState(section.title);
  const [subtitle, setSubtitle] = useState(section.subtitle);
  const [isPublished, setIsPublished] = useState(section.isPublished);

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
    return Array.isArray(raw)
      ? (raw as Array<Record<string, string>>).map((item) =>
          Object.fromEntries(
            (config.items ?? []).map((f) => [f.key, String(item[f.key] ?? "")]),
          ),
        )
      : [];
  });

  const [openGroup, setOpenGroup] = useState<string | null>(
    config.fieldGroups?.[0]?.label ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const toggleGroup = (label: string) => {
    setOpenGroup((current) => (current === label ? null : label));
  };

  const patchExtra = (key: string, value: string) => {
    setExtra((prev) => ({ ...prev, [key]: value }));
  };

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
    const content: Record<string, unknown> = config.items ? { items: itemsNow } : {};
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
          spec={config.items}
          initialItems={items}
          onChange={setItems}
          onSave={(next) => void persist({ items: next })}
          emptyMessage={`Esta sección no tiene elementos todavía.`}
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

      {!config.hideBaseFields && !config.fieldGroups ? renderBaseFields() : null}

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

      {config.items && !config.fieldGroups ? (
        <ItemsEditor
          spec={config.items}
          initialItems={items}
          onChange={setItems}
          onSave={(next) => void persist({ items: next })}
          emptyMessage={`Esta sección no tiene elementos todavía.`}
        />
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => {
            setIsPublished(e.target.checked);
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
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
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

  const scrollPreviewTo = (anchor: string) => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc?.documentElement) return;
    if (anchor) {
      const el = doc.getElementById(anchor);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      doc.documentElement.scrollTop = 0;
      doc.body.scrollTop = 0;
    }
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

  const onSaved = () => {
    setReloadKey((k) => k + 1);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlash(`«${LANDING_SECTION_LABELS[step.section]}»: cambios guardados. La vista previa se actualizó.`);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3200);
  };

  return (
    <div className="mt-2 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              {LANDING_SECTION_LABELS[step.section]}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.config.description}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              section.isPublished
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                section.isPublished ? "bg-emerald-500" : "bg-muted-foreground"
              }`}
            />
            {section.isPublished ? "Publicada" : "Oculta"}
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

      <div className="hidden overflow-hidden rounded-lg border border-border bg-card xl:block">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            Vista previa
            <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              Mostrando · {LANDING_SECTION_LABELS[step.section]}
            </span>
          </span>
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Abrir en pestaña ↗
          </a>
        </div>
        <iframe
          ref={iframeRef}
          key={`${reloadKey}-${previewHref}`}
          src={previewHref}
          title="Vista previa de la landing"
          className="w-full border-0 bg-white"
          style={{ height: "calc(100vh - 7.5rem)" }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          onLoad={() =>
            window.setTimeout(() => scrollPreviewTo(SECTION_ANCHORS[step.section] ?? ""), 150)
          }
        />
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