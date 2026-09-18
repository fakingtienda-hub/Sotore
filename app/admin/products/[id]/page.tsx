import Link from "next/link";
import { notFound } from "next/navigation";

import { getProduct } from "@/lib/server/actions/products";

import { ProductForm } from "../_components/product-form";

export const metadata = {
  title: "Editar producto · Admin",
};

type EditValues = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  theme: string;
  status: string;
  coverImageUrl: string | null;
};

function toEditValues(row: NonNullable<Awaited<ReturnType<typeof getProduct>>>): EditValues {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    shortDescription: row.shortDescription,
    description: row.description,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    currency: row.currency,
    theme: row.theme,
    status: row.status,
    coverImageUrl: row.coverImageUrl,
  };
}

export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (product == null) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Editar producto</h1>
          <p className="text-sm text-muted-foreground">
            Actualiza los datos del producto y su estado de publicación.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/products/${product.id}/files`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Archivos
          </Link>
          <Link
            href="/admin/products"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Volver
          </Link>
        </div>
      </div>

      <ProductForm mode="edit" product={toEditValues(product)} />
    </div>
  );
}
