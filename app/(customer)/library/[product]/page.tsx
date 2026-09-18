import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatFileSize, formatPrice } from "@/lib/utils/format";
import { FilesList } from "./_components/files-list";

export const dynamic = "force-dynamic";

export default async function LibraryProductPage({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const user = await requireUser();
  const { product: slug } = await params;

  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);

  if (!product) notFound();

  const [purchase] = await db
    .select()
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.userId, user.id),
        eq(schema.purchases.productId, product.id),
        eq(schema.purchases.status, "active"),
      ),
    )
    .limit(1);

  if (!purchase) notFound();

  const [files, groups] = await Promise.all([
    db
      .select()
      .from(schema.productFiles)
      .where(and(eq(schema.productFiles.productId, product.id), eq(schema.productFiles.isActive, true)))
      .orderBy(schema.productFiles.sortOrder),
    db
      .select()
      .from(schema.productFileGroups)
      .where(eq(schema.productFileGroups.productId, product.id))
      .orderBy(schema.productFileGroups.position),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href="/library" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        ← Volver a mi biblioteca
      </Link>

      <div className="mt-2 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="shrink-0">
          {product.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.coverImageUrl}
              alt={product.title}
              className="h-48 w-48 rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-2xl border border-border bg-card text-5xl opacity-40" aria-hidden>📦</div>
          )}
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{product.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatPrice(product.price, product.currency)}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Archivos incluidos</h2>
        {product.zipKey ? (
          <a
            href={`/api/products/${product.id}/pack`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Descargar todo (ZIP)
            {product.zipSizeBytes != null ? ` · ${formatFileSize(product.zipSizeBytes)}` : ""}
          </a>
        ) : null}
      </div>

      <FilesList
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        files={files.map((f) => ({
          id: f.id,
          name: f.name,
          fileType: f.fileType,
          sizeBytes: f.sizeBytes,
          mimeType: f.mimeType,
          downloadLimit: f.downloadLimit,
          groupId: f.groupId,
        }))}
      />
    </div>
  );
}
