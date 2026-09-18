import { notFound, redirect } from "next/navigation";

import { getPublishedProductBySlug } from "@/lib/server/actions/checkout";

export const dynamic = "force-dynamic";

export default async function StoreProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  if (!product) notFound();
  redirect(`/checkout/${product.slug}`);
}