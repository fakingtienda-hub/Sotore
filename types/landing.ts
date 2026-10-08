export const LANDING_SECTIONS = [
  "hero",
  "benefits",
  "content",
  "bonuses",
  "testimonials",
  "faq",
  "cta",
  "site",
] as const;

export type LandingSection = (typeof LANDING_SECTIONS)[number];

export const LANDING_WIZARD_SECTIONS = [
  "site",
  "hero",
  "benefits",
  "content",
  "bonuses",
  "testimonials",
  "faq",
  "cta",
] as const;

export const LANDING_SECTION_LABELS: Record<LandingSection, string> = {
  hero: "Hero",
  benefits: "Beneficios",
  content: "Contenido incluido",
  bonuses: "Bonos",
  testimonials: "Testimonios",
  faq: "Preguntas frecuentes",
  cta: "Llamada a la acción",
  site: "Sitio · textos globales",
};

export type Item = {
  /** Identificador estable generado por el editor (ausente en datos antiguos). */
  id?: string;
  title: string;
  description?: string;
};

export type Testimonial = {
  id?: string;
  author: string;
  role?: string;
  quote: string;
  rating?: number;
};

export type FaqItem = {
  id?: string;
  question: string;
  answer: string;
};

export type HeroContent = {
  badge?: string;
  ctaText?: string;
  ctaProductSlug?: string;
};

export type BenefitsContent = { items: Item[]; eyebrow?: string };
export type ContentContent = { items: Item[]; eyebrow?: string };
export type BonusesContent = { items: Item[]; eyebrow?: string };
export type TestimonialsContent = { items: Testimonial[]; eyebrow?: string };
export type FaqContent = { items: FaqItem[]; eyebrow?: string };

export type CtaContent = {
  eyebrow?: string;
  ctaText?: string;
  ctaProductSlug?: string;
};

export type RequiredSiteContent = Required<SiteContent>;

export type SiteContent = {
  tickerItems?: string[];
  trustRows?: string[];
  patternChips?: string[];
  headerBadge?: string;
  headerTag?: string;
  footerBadges?: string[];
  bonusTag?: string;
  heroSecondaryCtaText?: string;
  heroPriceKicker?: string;
  heroPriceNote?: string;
  ctaPriceKicker?: string;
  ctaPriceNote?: string;
  ctaFootnote?: string;
  featuredProductSlug?: string;
  /** Fuente de titulares y elementos display (vacío = según el tema). Ver `lib/landing-fonts.ts`. */
  titleFont?: string;
};

export const SITE_DEFAULTS: Required<SiteContent> = {
  tickerItems: [
    "Acceso inmediato tras el pago",
    "Moldes listos para imprimir",
    "Videos paso a paso",
    "Pago seguro con Wompi",
    "Descargas de por vida",
  ],
  trustRows: ["Pago seguro con Wompi", "Descarga inmediata", "Acceso de por vida"],
  patternChips: ["MOLDES", "VIDEOS", "PDFs", "CHECKLIST"],
  headerBadge: "Pago seguro · Descarga inmediata",
  headerTag: "Taller digital",
  footerBadges: ["Pago seguro con Wompi", "Acceso de por vida", "Soporte por email"],
  bonusTag: "BONO",
  heroSecondaryCtaText: "Ver qué incluye",
  heroPriceKicker: "Hoy solo",
  heroPriceNote: "Pago único · acceso de por vida",
  ctaPriceKicker: "Oferta de la semana",
  ctaPriceNote: "Pago único · acceso de por vida",
  ctaFootnote: "Pago seguro con Wompi · recibes el acceso al instante",
  featuredProductSlug: "",
  titleFont: "",
};

export type LandingContent = {
  hero: HeroContent;
  benefits: BenefitsContent;
  content: ContentContent;
  bonuses: BonusesContent;
  testimonials: TestimonialsContent;
  faq: FaqContent;
  cta: CtaContent;
  site: SiteContent;
};

export type LandingSectionData = {
  section: LandingSection;
  title: string;
  subtitle: string;
  content: LandingContent[LandingSection];
  isPublished: boolean;
};