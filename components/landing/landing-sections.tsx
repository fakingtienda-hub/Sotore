import Link from "next/link";
import { Fragment } from "react";

import { getLandingShowcaseProduct } from "@/lib/server/actions/checkout";
import { formatPrice } from "@/lib/utils/format";
import { Reveal } from "@/components/storefront/reveal";
import { Ticker } from "@/components/storefront/ticker";
import { PriceTicket } from "@/components/storefront/price-ticket";
import { HeroPriceCrop } from "@/components/landing/hero-price-crop";
import { LandingDetailsScroll } from "@/components/landing/landing-details-scroll";
import {
  SITE_DEFAULTS,
  type LandingSectionData,
  type SiteContent,
} from "@/types/landing";

type SiteConfig = Required<SiteContent>;

const BENEFITS_EYEBROW = "Beneficios";
const CONTENT_EYEBROW = "Contenido incluido";
const BONUSES_EYEBROW = "Bonos de hoy";
const TESTIMONIALS_EYEBROW = "Quién ya lo probó";
const FAQ_EYEBROW = "Preguntas frecuentes";
const CTA_EYEBROW = "Última llamada";

function SplitHeadline({ title }: { title: string }) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return <span className="sf-title-accent">{words[0] ?? title}</span>;
  }
  const half = Math.ceil(words.length / 2);
  const first = words.slice(0, half).join(" ");
  const second = words.slice(half).join(" ");
  // Homogéneo: ambas líneas con el mismo relleno y la misma voz tipográfica;
  // solo la segunda lleva el color de acento de marca.
  return (
    <>
      <span className="block">{first}</span>
      <span className="block sf-title-accent">{second}</span>
    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  section,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Sección del CRM a la que pertenece: el preview la usa para editar en línea. */
  section: string;
}) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const last = words.length > 1 ? words.pop() : undefined;
  const rest = words.join(" ");
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <span className="sf-eyebrow justify-center" data-sf-edit={`${section}.eyebrow`}>
        {eyebrow}
      </span>
      <h2
        className="sf-title mt-4 text-3xl text-[var(--sf-paper)] sm:text-5xl lg:text-6xl"
        data-sf-edit={`${section}.title`}
      >
        {rest} {last ? <span className="sf-title-accent">{last}</span> : null}
      </h2>
      {subtitle ? (
        <p
          className="sf-muted mt-5 text-base leading-relaxed sm:text-lg"
          data-sf-edit={`${section}.subtitle`}
        >
          {subtitle}
        </p>
      ) : null}
    </Reveal>
  );
}

function HeroSection({
  data,
  product,
  site,
  secondaryHref,
}: {
  data: LandingSectionData;
  product: HeroProduct;
  site: SiteConfig;
  secondaryHref: string | null;
}) {
  const content = data.content as { badge?: string; ctaText?: string };
  const href = product ? `/checkout/${product.slug}` : "";
  const isBuyable = product?.status === "published";

  return (
    <header
      id="hero"
      className="sf-fabric relative lg:h-dvh"
      // Sin `overflow-hidden` ni altura mínima forzada en móvil: si el contenido
      // crece (imagen + precio + textos editables), la página scrollea en vez
      // de recortar. En desktop, en cambio, el hero mide EXACTO el viewport
      // (`h-dvh`) y el CSS recorta el sobrante: nada de scroll de unos pocos px.
    >
      <div className="sf-wrap grid items-center gap-12 max-sm:gap-6 pt-16 pb-12 max-lg:pt-[88px] lg:min-h-dvh lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <Reveal>
            <h1
              className="sf-title text-[clamp(2.75rem,9vw,6.25rem)] text-[var(--sf-paper)]"
              data-sf-edit="hero.title"
            >
              <SplitHeadline title={data.title || "Pack de moldes premium"} />
            </h1>
            {data.subtitle ? (
              <p
                className="sf-hero-sub mt-7 max-w-xl text-lg leading-relaxed sm:text-xl"
                data-sf-edit="hero.subtitle"
              >
                {data.subtitle}
              </p>
            ) : null}

            <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              {isBuyable ? (
                <Link href={href} className="sf-btn text-lg w-full sm:w-auto" data-sf-edit="hero.ctaText">
                  {content.ctaText || "Quiero el pack"}
                </Link>
              ) : null}
              {secondaryHref ? (
                <Link href={secondaryHref} className="sf-btn sf-btn-ghost text-base w-full sm:w-auto">
                  {site.heroSecondaryCtaText}
                </Link>
              ) : null}
            </div>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <HeroPriceCrop>
            {product?.coverImageUrl ? (
              <div className="sf-hero-media aspect-[4/5] w-full rotate-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.coverImageUrl}
                  alt={product.title}
                  loading="eager"
                  fetchPriority="high"
                  sizes="(min-width: 1024px) 448px, 100vw"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <PatternSheet title={product?.title ?? data.title} chips={site.patternChips} />
            )}

            {product ? (
              <div className="relative z-10 max-lg:absolute max-lg:bottom-[calc(24px+var(--sf-crop,0px))] max-lg:left-1/2 max-lg:-translate-x-1/2 lg:absolute lg:bottom-[calc(26px+var(--sf-crop,0px))] lg:left-1/2 lg:-translate-x-1/2">
                <PriceTicket
                  kicker={site.heroPriceKicker}
                  price={product.price}
                  currency={product.currency}
                  compareAt={product.compareAtPrice}
                  note={site.heroPriceNote}
                />
              </div>
            ) : null}
          </HeroPriceCrop>
        </Reveal>
      </div>
    </header>
  );
}

// FUTURO (pendiente de aprobación): mover a la tarjeta "Sitio" del CRM los
// textos decorativos de la hoja de molde (FK · 001, Est. 2026, "El pack",
// TALLA ÚNICA · ESCALA 100%, "recortar aquí") para que la landing sea 100%
// editable. Por ahora quedan como arte fijo del diseño.
function PatternSheet({ title, chips }: { title: string; chips: string[] }) {
  return (
    <div className="sf-sheet mx-auto aspect-[4/5] max-w-md">
      <div className="relative flex h-full flex-col justify-between p-8">
        <div className="flex items-start justify-between">
          <span className="sf-label">FK · 001</span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em]">Est. 2026</span>
        </div>

        <div className="relative">
          <span className="sf-display text-[clamp(2rem,5vw,3.2rem)] leading-none text-[var(--sf-tag-ink)]">
            El pack
          </span>
          <span className="sf-display mt-1 block text-[clamp(2.4rem,6.5vw,4rem)] leading-[0.9] text-transparent [text-stroke:2px_var(--sf-tag-ink)] [-webkit-text-stroke:2px_var(--sf-tag-ink)]">
            {title}
          </span>

          {chips.length > 0 ? (
            <div className="mt-8 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="border border-dashed border-[rgba(22,17,12,0.5)] px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.18em]"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex h-28 items-center justify-center">
          <svg viewBox="0 0 200 120" className="h-full w-full opacity-70" aria-hidden>
            <path
              d="M20 100 Q 60 10 100 60 T 180 30 M20 20 Q 70 110 130 40"
              fill="none"
              stroke="var(--sf-thread-deep)"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="flex items-end justify-between">
          <span className="font-mono text-[10px] tracking-[0.25em]">TALLA ÚNICA · ESCALA 100%</span>
          <span className="font-mono text-[10px] tracking-[0.25em]">recortar aquí ✂</span>
        </div>
      </div>
    </div>
  );
}

function BenefitsSection({ data }: { data: LandingSectionData }) {
  const content = data.content as { items: Array<{ title: string; description?: string }>; eyebrow?: string };
  if (content.items.length === 0) return null;

  return (
    <section id="beneficios" className="relative border-t border-[var(--sf-line)] py-12 md:py-16">
      <div className="sf-wrap">
        <SectionHeader section="benefits" eyebrow={content.eyebrow || BENEFITS_EYEBROW} title={data.title || "Por qué te va a encantar"} subtitle={data.subtitle} />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {content.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 70}>
              <div className="sf-card h-full">
                <div className="flex items-center gap-3">
                  <span className="sf-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[var(--sf-thread)] to-transparent" />
                </div>
                <h3 className="sf-title mt-5 text-2xl leading-none text-[var(--sf-paper)]" data-sf-edit={`benefits.items.${i}.title`}>
                  {item.title}
                </h3>
                {item.description ? (
                  <p className="sf-muted mt-3 text-sm leading-relaxed" data-sf-edit={`benefits.items.${i}.description`}>
                    {item.description}
                  </p>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContentSection({ data }: { data: LandingSectionData }) {
  const content = data.content as { items: Array<{ title: string; description?: string }>; eyebrow?: string };
  if (content.items.length === 0) return null;

  return (
    <section id="contenido" className="relative border-t border-[var(--sf-line)] bg-[var(--sf-ink-2)] py-12 md:py-16">
      <div className="sf-wrap">
        <SectionHeader section="content" eyebrow={content.eyebrow || CONTENT_EYEBROW} title={data.title || "Todo lo que trae"} subtitle={data.subtitle} />
        <Reveal className="mt-14 mx-auto max-w-3xl">
          <ol className="sf-card p-0 overflow-hidden">
            {content.items.map((item, i) => (
              <li
                key={item.title}
                className="flex gap-4 border-b border-dashed border-[var(--sf-line)] p-5 last:border-b-0"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sf-thread)] text-sm font-bold text-[var(--sf-ink-2)]">
                  ✓
                </span>
                <div>
                  <h3 className="font-semibold text-[var(--sf-paper)]" data-sf-edit={`content.items.${i}.title`}>
                    {item.title}
                  </h3>
                  {item.description ? (
                    <p className="sf-muted mt-1 text-sm leading-relaxed" data-sf-edit={`content.items.${i}.description`}>
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

function BonusesSection({ data, site }: { data: LandingSectionData; site: SiteConfig }) {
  const content = data.content as { items: Array<{ title: string; description?: string }>; eyebrow?: string };
  if (content.items.length === 0) return null;

  return (
    <section id="bonos" className="relative border-t border-[var(--sf-line)] py-12 md:py-16">
      <div className="sf-wrap">
        <SectionHeader section="bonuses" eyebrow={content.eyebrow || BONUSES_EYEBROW} title={data.title || "Bonus incluidos"} subtitle={data.subtitle} />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {content.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 80}>
              <div className="sf-patch h-full">
                <span className="inline-block border border-[rgba(22,17,12,0.5)] px-2.5 py-1 font-mono text-[12px] font-bold tracking-[0.2em] text-[var(--sf-tag-ink)]">
                  {site.bonusTag}
                </span>
                <h3 className="sf-title mt-5 text-3xl leading-none text-[var(--sf-tag-ink)]" data-sf-edit={`bonuses.items.${i}.title`}>
                  {item.title}
                </h3>
                {item.description ? (
                  <p className="mt-3 text-sm font-medium leading-relaxed text-[rgba(22,17,12,0.92)]" data-sf-edit={`bonuses.items.${i}.description`}>
                    {item.description}
                  </p>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection({ data }: { data: LandingSectionData }) {
  const content = data.content as {
    items: Array<{ author: string; role?: string; quote: string; rating?: number }>;
    eyebrow?: string;
  };
  if (content.items.length === 0) return null;

  return (
    <section id="testimonios" className="relative border-t border-[var(--sf-line)] bg-[var(--sf-ink-2)] py-12 md:py-16">
      <div className="sf-wrap">
        <SectionHeader section="testimonials" eyebrow={content.eyebrow || TESTIMONIALS_EYEBROW} title={data.title || "Resultados reales"} subtitle={data.subtitle} />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item, i) => {
            const rating = Math.min(5, Math.max(0, item.rating ?? 5));
            return (
              <Reveal key={item.author} delay={i * 80}>
                <figure className="sf-card flex h-full flex-col">
                  <div className="flex gap-1 text-[var(--sf-gold)]" aria-hidden="true">
                    {Array.from({ length: rating }).map((_, s) => (
                      <span key={s}>★</span>
                    ))}
                  </div>
                  <span className="sr-only">{`Calificación: ${rating} de 5 estrellas`}</span>
                  <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-[var(--sf-paper)]" data-sf-edit={`testimonials.items.${i}.quote`}>
                    <span className="sf-thread font-mono text-2xl leading-none">“</span>
                    {item.quote}
                  </blockquote>
                  <figcaption className="mt-5 border-t border-dashed border-[var(--sf-line)] pt-4">
                    <span className="font-semibold text-[var(--sf-paper)]" data-sf-edit={`testimonials.items.${i}.author`}>
                      {item.author}
                    </span>
                    {item.role ? <span className="sf-label block mt-1">{item.role}</span> : null}
                  </figcaption>
                </figure>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ data }: { data: LandingSectionData }) {
  const content = data.content as { items: Array<{ question: string; answer: string }>; eyebrow?: string };
  if (content.items.length === 0) return null;

  return (
    <section id="faq" className="relative border-t border-[var(--sf-line)] py-12 md:py-16">
      <div className="sf-wrap">
        <SectionHeader section="faq" eyebrow={content.eyebrow || FAQ_EYEBROW} title={data.title || "Antes de comprar"} subtitle={data.subtitle} />
        <Reveal className="mt-14 mx-auto max-w-3xl">
          <div className="sf-card p-0 overflow-hidden">
            {content.items.map((item, i) => (
              <details key={item.question} className="sf-faq border-b border-dashed border-[var(--sf-line)] last:border-b-0 px-6">
                <summary>
                  <span className="font-semibold text-[var(--sf-paper)]" data-sf-edit={`faq.items.${i}.question`}>
                    {item.question}
                  </span>
                </summary>
                <div className="faq-a text-sm leading-relaxed" data-sf-edit={`faq.items.${i}.answer`}>
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CtaSection({ data, product, site }: { data: LandingSectionData; product: HeroProduct; site: SiteConfig }) {
  const content = data.content as { eyebrow?: string; ctaText?: string };
  const href = product ? `/checkout/${product.slug}` : "";
  const isBuyable = product?.status === "published";

  return (
    <section id="comprar" className="relative overflow-hidden border-t border-[var(--sf-line)]">
      <div className="sf-fabric-lg py-16 md:py-20">
        <div className="sf-wrap flex flex-col items-center text-center">
          <Reveal>
            <span className="sf-eyebrow" data-sf-edit="cta.eyebrow">{content.eyebrow || CTA_EYEBROW}</span>
            <h2
              className="sf-title mt-5 max-w-3xl text-[clamp(2.6rem,7vw,5.5rem)] text-[var(--sf-paper)]"
              data-sf-edit="cta.title"
            >
              <SplitHeadline title={data.title || "Arranca tu taller hoy mismo"} />
            </h2>
            {data.subtitle ? (
              <p className="sf-muted mx-auto mt-6 max-w-xl text-lg leading-relaxed" data-sf-edit="cta.subtitle">
                {data.subtitle}
              </p>
            ) : null}

            <div className="mt-10 flex flex-col items-center gap-5">
              {product ? (
                <PriceTicket
                  kicker={site.ctaPriceKicker}
                  price={product.price}
                  currency={product.currency}
                  compareAt={product.compareAtPrice}
                  note={site.ctaPriceNote}
                />
              ) : null}
              {isBuyable ? (
                <Link href={href} className="sf-btn text-lg w-full sm:w-auto" data-sf-edit="cta.ctaText">
                  {content.ctaText || "Quiero el pack"} · {formatPrice(product.price, product.currency)}
                </Link>
              ) : null}
              <p className="sf-label">{site.ctaFootnote}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

type HeroProduct = Awaited<ReturnType<typeof getLandingShowcaseProduct>> | null;

const DETAIL_HREF = "/que-incluye";

export async function LandingSections({
  data,
  mode = "hero",
}: {
  data: LandingSectionData[];
  mode?: "hero" | "details";
}) {
  const hero = data.find((s) => s.section === "hero");
  const siteBlock = data.find((s) => s.section === "site");
  const site: SiteConfig = {
    ...SITE_DEFAULTS,
    ...((siteBlock?.content ?? {}) as Partial<SiteContent>),
  };
  const heroSlug = (hero?.content as { ctaProductSlug?: string } | undefined)?.ctaProductSlug;
  const featuredSlug = site.featuredProductSlug || heroSlug;
  let product = featuredSlug ? await getLandingShowcaseProduct(featuredSlug) : null;
  if (!product && heroSlug && heroSlug !== featuredSlug) {
    product = await getLandingShowcaseProduct(heroSlug);
  }

  const renderers: Record<string, (d: LandingSectionData) => React.ReactNode> = {
    benefits: (d) => <BenefitsSection data={d} />,
    content: (d) => <ContentSection data={d} />,
    bonuses: (d) => <BonusesSection data={d} site={site} />,
    testimonials: (d) => <TestimonialsSection data={d} />,
    faq: (d) => <FaqSection data={d} />,
    cta: (d) => <CtaSection data={d} product={product} site={site} />,
    site: () => null,
  };

  const published = data.filter((s) => s.isPublished && s.section !== "site");
  const detailSections = published.filter((s) => s.section !== "hero");
  // El botón "Ver qué incluye" solo tiene sentido si /que-incluye muestra algo:
  // al menos una sección de datos (contenido, beneficios, bonos, testimonios o
  // FAQ) con elementos. El CTA final no cuenta (siempre se pinta).
  const hasWhatIncludes = detailSections.some((s) => {
    if (s.section === "cta") return false;
    const items = (s.content as { items?: unknown[] } | undefined)?.items;
    return Array.isArray(items) && items.length > 0;
  });
  const hasDetails = detailSections.length > 0;

  if (mode === "hero") {
    return (
      <main className="relative">
        <HeroSection
          data={
            hero ?? {
              section: "hero",
              title: "Pack de moldes premium",
              subtitle: "",
              content: {},
              isPublished: true,
            }
          }
          product={product}
          site={site}
          secondaryHref={hasWhatIncludes ? DETAIL_HREF : null}
        />
      </main>
    );
  }

  const contentSectionData = detailSections.find((s) => s.section === "content");
  const stackSections = detailSections.filter((s) => s.section !== "content");

  const contentNode = contentSectionData
    ? renderers[contentSectionData.section]?.(contentSectionData)
    : null;

  const stackNode = stackSections.map((section) => (
    <Fragment key={section.section}>
      {section.section === "cta" ? <Ticker items={site.tickerItems} /> : null}
      {renderers[section.section]?.(section)}
    </Fragment>
  ));

  return (
    <>
      <main className="relative">
        {hasDetails ? <Ticker items={site.tickerItems} /> : null}
        <LandingDetailsScroll content={contentNode} stack={stackNode} />
      </main>

      {product && product.status === "published" ? (
        <>
          <div className="h-20 md:hidden" aria-hidden="true" />
          <div className="sf-buybar fixed inset-x-0 bottom-0 z-50 md:hidden">
            <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 pr-1">
                <span className="block truncate text-[12px] uppercase tracking-[0.16em] text-[var(--sf-muted)]">
                  {site.ctaPriceKicker}
                </span>
                <span className="sf-display block text-xl leading-none text-[var(--sf-paper)]">
                  {formatPrice(product.price, product.currency)}
                </span>
              </div>
              <Link
                href={product ? `/checkout/${product.slug}` : ""}
                className="sf-btn shrink-0 text-base"
              >
                {(hero?.content as { ctaText?: string } | undefined)?.ctaText ?? "Comprar ahora"}
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

