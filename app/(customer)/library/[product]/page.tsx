import { and, count, eq, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { FilesList, type LibraryFileGroup, type LibraryFileRow } from "./_components/files-list";
import { PackDownload } from "./_components/pack-download";
import "./_components/library-gallery.css";

export const dynamic = "force-dynamic";

export default async function LibraryProductPage({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const user = await requireUser();
  const { product: slug } = await params;

  const [product] = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      title: schema.products.title,
      price: schema.products.price,
      compareAtPrice: schema.products.compareAtPrice,
      currency: schema.products.currency,
      coverImageUrl: schema.products.coverImageUrl,
      zipSizeBytes: schema.products.zipSizeBytes,
    })
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

  // El cliente final solo ve portada + botón de descarga, así que no consultamos
  // el detalle de archivos: son cientos de filas y una petición por archivo para
  // miniaturas que ya no mostramos. El admin sí lo necesita para revisar el pack.
  if (user.role !== "admin") {
    const [agg] = await db
      .select({ n: count() })
      .from(schema.productFiles)
      .where(
        and(
          eq(schema.productFiles.productId, product.id),
          eq(schema.productFiles.isActive, true),
          isNotNull(schema.productFiles.groupId),
        ),
      );

    return (
      <PackDownload
        product={{
          id: product.id,
          title: product.title,
          coverImageUrl: product.coverImageUrl ?? null,
          zipSizeBytes: product.zipSizeBytes,
        }}
        fileCount={agg?.n ?? 0}
      />
    );
  }

  const [fileRows, groups, downloadRows] = await Promise.all([
    db
      .select()
      .from(schema.productFiles)
      .where(
        and(
          eq(schema.productFiles.productId, product.id),
          eq(schema.productFiles.isActive, true),
          /* Solo los archivos del curso: los que están en una carpeta. Las
             imágenes de promoción del producto se cargan sin carpeta y no
             deben aparecer en la biblioteca. */
          isNotNull(schema.productFiles.groupId),
        ),
      )
      .orderBy(schema.productFiles.sortOrder),
    db
      .select()
      .from(schema.productFileGroups)
      .where(eq(schema.productFileGroups.productId, product.id))
      .orderBy(schema.productFileGroups.position),
    db
      .select({
        fileId: schema.downloads.fileId,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.downloads)
      .where(eq(schema.downloads.productId, product.id))
      .groupBy(schema.downloads.fileId),
  ]);

  const downloadsByFile = new Map(downloadRows.map((d) => [d.fileId, d.n]));

  const groupCounts = new Map<string, number>();
  for (const f of fileRows) {
    if (f.groupId) {
      groupCounts.set(f.groupId, (groupCounts.get(f.groupId) ?? 0) + 1);
    }
  }

  const files: LibraryFileRow[] = fileRows.map((f) => ({
    id: f.id,
    name: f.name,
    fileType: f.fileType,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    downloadLimit: f.downloadLimit,
    groupId: f.groupId as string,
    createdAt: f.createdAt.toISOString(),
    downloadCount: f.id ? (downloadsByFile.get(f.id) ?? 0) : 0,
  }));

  const catalogGroups: LibraryFileGroup[] = groups
    .map((g) => ({ id: g.id, name: g.name, count: groupCounts.get(g.id) ?? 0 }))
    .filter((g) => g.count > 0);

  return (
    <div className="library-gallery">
      <FilesList
        product={{
          id: product.id,
          slug: product.slug,
          title: product.title,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          currency: product.currency,
          coverImageUrl: product.coverImageUrl ?? null,
          zipSizeBytes: product.zipSizeBytes,
        }}
        files={files}
        groups={catalogGroups}
        userId={user.id}
      />
    </div>
  );
}