"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  LANDING_SECTIONS,
  SITE_DEFAULTS,
  type LandingContent,
  type LandingSection,
  type LandingSectionData,
  type SiteContent,
} from "@/types/landing";

const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

const testimonialSchema = z.object({
  author: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).optional(),
  quote: z.string().trim().min(1).max(4000),
  rating: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "") || v == null ? undefined : v,
      z.coerce.number().int().min(1).max(5).optional(),
    )
    .optional(),
});

const faqSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(8000),
});

const textField = z.string().trim().max(200).optional();
const linesField = z.array(z.string().trim().max(300)).max(40).optional();

const heroContentSchema = z.object({
  badge: textField,
  ctaText: textField,
  ctaProductSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).optional(),
});

const ctaContentSchema = z.object({
  eyebrow: textField,
  ctaText: textField,
  ctaProductSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).optional(),
});

const listContentSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item).max(30), eyebrow: textField });

const siteContentSchema = z.object({
  tickerItems: linesField,
  trustRows: linesField,
  patternChips: linesField,
  headerBadge: textField,
  headerTag: textField,
  footerBadges: linesField,
  bonusTag: textField,
  heroSecondaryCtaText: textField,
  heroPriceKicker: textField,
  heroPriceNote: textField,
  ctaPriceKicker: textField,
  ctaPriceNote: textField,
  ctaFootnote: textField,
  featuredProductSlug: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "") || v == null ? undefined : v,
      z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).optional(),
    )
    .optional(),
  titleFont: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "") || v == null ? undefined : v,
      z.string().trim().max(60).optional(),
    )
    .optional(),
});

const sectionSchemas: Record<LandingSection, z.ZodType<LandingContent[LandingSection]>> = {
  hero: heroContentSchema,
  benefits: listContentSchema(itemSchema),
  content: listContentSchema(itemSchema),
  bonuses: listContentSchema(itemSchema),
  testimonials: listContentSchema(testimonialSchema),
  faq: listContentSchema(faqSchema),
  cta: ctaContentSchema,
  site: siteContentSchema,
};

const blockInputSchema = z.object({
  title: z.string().trim().max(200),
  subtitle: z.string().trim().max(2000),
  isPublished: z.boolean(),
  content: z.unknown(),
});

export async function listLandingBlocks(): Promise<schema.LandingBlock[]> {
  return db
    .select()
    .from(schema.landingBlocks)
    .orderBy(asc(schema.landingBlocks.section), asc(schema.landingBlocks.sortOrder));
}

export async function saveLandingSection(
  section: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  if (!LANDING_SECTIONS.includes(section as LandingSection)) {
    return { ok: false, error: "Sección desconocida." };
  }
  const sectionKey = section as LandingSection;

  const parsed = blockInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }

  const contentResult = sectionSchemas[sectionKey].safeParse(parsed.data.content);
  if (!contentResult.success) {
    return { ok: false, error: contentResult.error.issues.map((e) => e.message).join("; ") };
  }

  const existing = await db
    .select({ id: schema.landingBlocks.id, content: schema.landingBlocks.content })
    .from(schema.landingBlocks)
    .where(eq(schema.landingBlocks.section, sectionKey))
    .limit(1);
  const prevFeatured =
    sectionKey === "site"
      ? ((existing[0]?.content as Record<string, unknown> | undefined)?.featuredProductSlug as string | undefined)
      : undefined;

  const values = {
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
    content: contentResult.data as object,
    isPublished: parsed.data.isPublished,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(schema.landingBlocks)
      .set(values)
      .where(eq(schema.landingBlocks.id, existing[0].id));
  } else {
    await db.insert(schema.landingBlocks).values({
      ...values,
      section: sectionKey,
      sortOrder: LANDING_SECTIONS.indexOf(sectionKey),
    });
  }

  // Al CAMBIAR el producto destacado, el texto principal del hero lo sigue
  // (título = nombre del producto, subtítulo = su descripción corta). Si no
  // cambia el producto, el texto manual del hero se conserva tal cual.
  if (sectionKey === "site") {
    const newFeatured = (contentResult.data as { featuredProductSlug?: string }).featuredProductSlug;
    if (newFeatured && newFeatured !== prevFeatured) {
      const [feat] = await db
        .select({ title: schema.products.title, shortDescription: schema.products.shortDescription })
        .from(schema.products)
        .where(eq(schema.products.slug, newFeatured))
        .limit(1);
      if (feat) {
        const heroHero = await db
          .select({ id: schema.landingBlocks.id, subtitle: schema.landingBlocks.subtitle })
          .from(schema.landingBlocks)
          .where(eq(schema.landingBlocks.section, "hero"))
          .limit(1);
        const heroSubtitle = feat.shortDescription?.trim() ? feat.shortDescription : (heroHero[0]?.subtitle ?? "");
        const heroValues = {
          title: feat.title,
          subtitle: heroSubtitle,
          updatedAt: new Date(),
        };
        if (heroHero.length > 0) {
          await db
            .update(schema.landingBlocks)
            .set(heroValues)
            .where(eq(schema.landingBlocks.id, heroHero[0].id));
        } else {
          await db.insert(schema.landingBlocks).values({
            ...heroValues,
            section: "hero",
            content: {},
            isPublished: true,
            sortOrder: LANDING_SECTIONS.indexOf("hero"),
          });
        }
      }
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/landing");
  return { ok: true };
}

export async function getPublishedLanding(): Promise<LandingSectionData[]> {
  const blocks = await db
    .select()
    .from(schema.landingBlocks)
    .where(eq(schema.landingBlocks.isPublished, true));

  const bySection = new Map(blocks.map((b) => [b.section as LandingSection, b]));

  const out: LandingSectionData[] = [];
  for (const section of LANDING_SECTIONS) {
    const block = bySection.get(section);
    if (!block) continue;

    const parsed = sectionSchemas[section].safeParse(block.content ?? {});
    const content =
      parsed.success ? parsed.data : ({} as LandingContent[LandingSection]);

    out.push({
      section,
      title: block.title ?? "",
      subtitle: block.subtitle ?? "",
      content,
      isPublished: block.isPublished,
    });
  }
  return out;
}

export async function getLandingSiteConfig(): Promise<Required<SiteContent>> {
  const blocks = await db
    .select()
    .from(schema.landingBlocks)
    .where(eq(schema.landingBlocks.section, "site"))
    .limit(1);

  const raw = blocks[0]?.content;
  const parsed = raw ? siteContentSchema.safeParse(raw) : undefined;
  return { ...SITE_DEFAULTS, ...(parsed?.success ? parsed.data : {}) };
}