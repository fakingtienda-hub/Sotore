import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { DEFAULT_LANDING_THEME, isLandingTheme, type LandingTheme } from "@/lib/constants";
import { getLandingSiteConfig } from "@/lib/server/actions/landing";

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

  // La landing jamás define un tema propio: muestra el del producto elegido
  // para vitrina (el que se fijó al crear/editar el producto). Si no hay
  // producto destacado se usa el tema por defecto, NO el de otro producto
  // escondido en un bloque (antes había un fallback a ctaProductSlug).
  const featured = await resolve(featuredSlug);
  return featured ?? DEFAULT_LANDING_THEME;
}