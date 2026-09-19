import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { getPublishedProductBySlug } from "@/lib/server/actions/checkout";
import { isLandingTheme } from "@/lib/constants";
import { CheckoutForm } from "./_components/checkout-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  if (!product) return { title: "Checkout · Fakingstore" };
  return { title: `Comprar ${product.title} · Fakingstore` };
}

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  if (!product) notFound();

  const files = await db
    .select()
    .from(schema.productFiles)
    .where(
      and(
        eq(schema.productFiles.productId, product.id),
        /* Solo los archivos del curso (con carpeta); las imágenes de
           promoción no se listan en el checkout. */
        isNotNull(schema.productFiles.groupId),
      ),
    )
    .orderBy(asc(schema.productFiles.sortOrder));
  const activeFiles = files.filter((f) => f.isActive);

  const bullets = (product.shortDescription ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="sf-fabric relative flex min-h-dvh flex-col" data-sf-theme={isLandingTheme(product.theme) ? product.theme : "costura"}>
      <div className="sf-checkout-page sf-wrap flex w-full flex-1 flex-col py-6 md:py-10">
        <CheckoutForm
          product={{
            id: product.id,
            slug: product.slug,
            title: product.title,
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            currency: product.currency,
            coverImageUrl: product.coverImageUrl ?? null,
          }}
          bullets={bullets}
          files={activeFiles.map((f) => ({ id: f.id, name: f.name, fileType: f.fileType }))}
        />
      </div>
    </div>
  );
}