import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AdminDownloadsPage() {
  const rows = await db
    .select({
      downloadId: schema.downloads.id,
      createdAt: schema.downloads.createdAt,
      ipAddress: schema.downloads.ipAddress,
      userName: schema.users.name,
      userEmail: schema.users.email,
      productTitle: schema.products.title,
      fileName: schema.productFiles.name,
      fileStorageKey: schema.productFiles.storageKey,
    })
    .from(schema.downloads)
    .innerJoin(schema.users, eq(schema.downloads.userId, schema.users.id))
    .innerJoin(schema.products, eq(schema.downloads.productId, schema.products.id))
    .innerJoin(schema.productFiles, eq(schema.downloads.fileId, schema.productFiles.id))
    .orderBy(desc(schema.downloads.createdAt))
    .limit(200);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Descargas</h1>
      <p className="mt-2 text-muted-foreground">
        Registro de descargas de archivos por cliente.
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Aún no hay descargas registradas.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Archivo</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.downloadId} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.userName}</p>
                    <p className="text-xs text-muted-foreground">{r.userEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{r.productTitle}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.fileName}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.ipAddress ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
