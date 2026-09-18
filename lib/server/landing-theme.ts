import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { DEFAULT_LANDING_THEME, isLandingTheme, type LandingTheme } from "@/lib/constants";
import { getLandingSiteConfig, getPublishedLanding } from "@/lib/server/actions/landing";

export async function getLandingTheme(): Promise<LandingTheme> {
  const site = await getLandingSiteConfig();
  const featuredSlug = site.featuredProductSlug;

  const resolve = async (slug?: string | null): Promise<LandingTheme | null> => {
    if (!slug) return null;
    const [product] = await db
      .select({ theme: schema.products.theme })
      .from(schema.products)
      .where(eq(schema.products.slug, slug))
      .limit(1);
    return product && isLandingTheme(product.theme) ? product.theme : null;
  };

  const featured = await resolve(featuredSlug);
  if (featured) return featured;

  const landing = await getPublishedLanding();
  const heroSlug = (landing.find((s) => s.section === "hero")?.content as { ctaProductSlug?: string } | undefined)
    ?.ctaProductSlug;
  const hero = await resolve(heroSlug);
  return hero ?? DEFAULT_LANDING_THEME;
}