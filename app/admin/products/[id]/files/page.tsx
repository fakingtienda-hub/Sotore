import Link from "next/link";
import { notFound } from "next/navigation";

import { getProduct, listProductFileGroups, listProductFiles } from "@/lib/server/actions/products";

import { ProductFilesForm } from "../../_components/product-files-form";
import { PackZipManager } from "../../_components/pack-zip-manager";

export const metadata = {
  title: "Archivos del producto · Admin",
};

export default async function AdminProductFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, files, groups] = await Promise.all([
    getProduct(id),
    listProductFiles(id),
    listProductFileGroups(id),
  ]);
  if (product == null) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {product.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los archivos descargables de este producto.
          </p>
        </div>
        <Link
          href={`/admin/products/${product.id}`}
          className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Volver al producto
        </Link>
      </div>

      <ProductFilesForm productId={product.id} files={files} groups={groups} />

      <PackZipManager
        productId={product.id}
        zipGeneratedAt={product.zipGeneratedAt}
        zipSizeBytes={product.zipSizeBytes}
      />
    </div>
  );
}
