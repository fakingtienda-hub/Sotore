/**
 * Repositorio de fuentes para el selector de tipografía del CRM
 * ("Sitio · textos globales").
 *
 * - Este módulo es SEGURO PARA CLIENTE (solo datos): lo consume el editor del
 *   admin para pintar el selector y la vista previa.
 * - Las fuentes se cargan de verdad en `app/fonts.ts` con `next/font/google`
 *   (self-hosted). El campo `stack` referencia la variable CSS que genera
 *   `next/font`, por eso los nombres deben coincidir EXACTAMENTE.
 * - `anton` reutiliza la variable ya existente `--font-poster` (no se carga dos
 *   veces). `georgia` es una serif del sistema (no descarga nada).
 */

export const LANDING_FONT_CATEGORIES = ["Impacto", "Sans moderna", "Serif editorial"] as const;
export type LandingFontCategory = (typeof LANDING_FONT_CATEGORIES)[number];

export type LandingFont = {
  value: string;
  label: string;
  category: LandingFontCategory;
  /** `font-family` completo (variable CSS de next/font + fallback). */
  stack: string;
  /** Peso recomendado para titulares. */
  weight: number;
  /** Tracking recomendado para titulares. */
  tracking: string;
  /** Descripción corta para el CRM. */
  note: string;
};

export const LANDING_FONTS: LandingFont[] = [
  {
    value: "archivo-black",
    label: "Archivo Black",
    category: "Impacto",
    stack: 'var(--font-archivo-black), "Archivo Black", "Arial Black", sans-serif',
    weight: 400,
    tracking: "-0.015em",
    note: "Sans muy pesada y ancha. Máximo impacto en titulares cortos.",
  },
  {
    value: "anton",
    label: "Anton",
    category: "Impacto",
    stack: 'var(--font-poster), "Anton", "Arial Narrow", sans-serif',
    weight: 400,
    tracking: "0.01em",
    note: "Condensada clásica del sitio. Alta y estrecha: entra mucho texto.",
  },
  {
    value: "bebas",
    label: "Bebas Neue",
    category: "Impacto",
    stack: 'var(--font-bebas), "Bebas Neue", "Arial Narrow", sans-serif',
    weight: 400,
    tracking: "0.02em",
    note: "Condensada en mayúsculas, estilo cartel. Muy legible y rotunda.",
  },
  {
    value: "oswald",
    label: "Oswald",
    category: "Impacto",
    stack: 'var(--font-oswald), "Oswald", "Arial Narrow", sans-serif',
    weight: 700,
    tracking: "0.01em",
    note: "Condensada moderna tipo periódico. Titulares serios y fuertes.",
  },
  {
    value: "fjalla",
    label: "Fjalla One",
    category: "Impacto",
    stack: 'var(--font-fjalla), "Fjalla One", "Arial Narrow", sans-serif',
    weight: 400,
    tracking: "0.01em",
    note: "Condensada con carácter. Buena para titulares deportivos.",
  },
  {
    value: "montserrat",
    label: "Montserrat",
    category: "Sans moderna",
    stack: 'var(--font-montserrat), "Montserrat", system-ui, sans-serif',
    weight: 800,
    tracking: "-0.01em",
    note: "Geométrica limpia y actual. Muy versátil en titulares.",
  },
  {
    value: "poppins",
    label: "Poppins",
    category: "Sans moderna",
    stack: 'var(--font-poppins), "Poppins", system-ui, sans-serif',
    weight: 700,
    tracking: "-0.01em",
    note: "Geométrica redondeada y amable. Estilo producto digital.",
  },
  {
    value: "outfit",
    label: "Outfit",
    category: "Sans moderna",
    stack: 'var(--font-outfit), "Outfit", system-ui, sans-serif',
    weight: 800,
    tracking: "-0.01em",
    note: "Sans contemporánea de trazos simples. Titulares grandes y claros.",
  },
  {
    value: "space-grotesk",
    label: "Space Grotesk",
    category: "Sans moderna",
    stack: 'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif',
    weight: 700,
    tracking: "-0.015em",
    note: "Técnica y con detalle. Buen contraste con el verde neón.",
  },
  {
    value: "sora",
    label: "Sora",
    category: "Sans moderna",
    stack: 'var(--font-sora), "Sora", system-ui, sans-serif',
    weight: 800,
    tracking: "-0.02em",
    note: "Tecnológica y compacta. Titulares con aire premium.",
  },
  {
    value: "inter",
    label: "Inter",
    category: "Sans moderna",
    stack: 'var(--font-inter), "Inter", system-ui, sans-serif',
    weight: 800,
    tracking: "-0.02em",
    note: "Neutra y muy legible. Sobria, sin distraer.",
  },
  {
    value: "playfair",
    label: "Playfair Display",
    category: "Serif editorial",
    stack: 'var(--font-playfair), "Playfair Display", Georgia, serif',
    weight: 800,
    tracking: "-0.01em",
    note: "Serif de alto contraste. Elegante y editorial.",
  },
  {
    value: "dm-serif",
    label: "DM Serif Display",
    category: "Serif editorial",
    stack: 'var(--font-dm-serif), "DM Serif Display", Georgia, serif',
    weight: 400,
    tracking: "0",
    note: "Serif display con curvas marcadas. Tono boutique.",
  },
  {
    value: "cinzel",
    label: "Cinzel",
    category: "Serif editorial",
    stack: 'var(--font-cinzel), "Cinzel", Georgia, serif',
    weight: 700,
    tracking: "0.02em",
    note: "Mayúsculas romanas grabadas. Sensación de lujo.",
  },
  {
    value: "cormorant",
    label: "Cormorant Garamond",
    category: "Serif editorial",
    stack: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
    weight: 700,
    tracking: "0.005em",
    note: "Serif fina y clásica. Muy elegante en tamaños grandes.",
  },
  {
    value: "libre-baskerville",
    label: "Libre Baskerville",
    category: "Serif editorial",
    stack: 'var(--font-libre-baskerville), "Libre Baskerville", Georgia, serif',
    weight: 700,
    tracking: "0",
    note: "Serif clásica de libro. Formal y confiable.",
  },
  {
    value: "lora",
    label: "Lora",
    category: "Serif editorial",
    stack: 'var(--font-lora), "Lora", Georgia, serif',
    weight: 700,
    tracking: "-0.01em",
    note: "Serif equilibrada con brush. Cálida y cercana.",
  },
  {
    value: "roboto-slab",
    label: "Roboto Slab",
    category: "Serif editorial",
    stack: 'var(--font-roboto-slab), "Roboto Slab", Georgia, serif',
    weight: 800,
    tracking: "-0.02em",
    note: "Slab serif gruesa. Firmeza tipo máquina de escribir.",
  },
  {
    value: "georgia",
    label: "Georgia (serif del sistema)",
    category: "Serif editorial",
    stack: 'Georgia, "Times New Roman", Times, serif',
    weight: 700,
    tracking: "0.03em",
    note: "Serif del sistema (no descarga fuentes). Look editorial sobrio.",
  },
];

const BY_VALUE = new Map(LANDING_FONTS.map((f) => [f.value, f]));

export function isLandingFont(value: string | null | undefined): boolean {
  return !!value && BY_VALUE.has(value);
}

export function getLandingFont(value: string | null | undefined): LandingFont | undefined {
  return value ? BY_VALUE.get(value) : undefined;
}

/** Valor especial del selector: "según el tema" (cada tema usa su fuente por defecto). */
export const LANDING_FONT_AUTO = "";
