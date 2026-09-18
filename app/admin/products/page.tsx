import Link from "next/link";
import { formatPrice } from "@/lib/utils/format";
import { listProducts } from "@/lib/server/actions/products";
import { deleteProduct } from "@/lib/server/actions/products";

export const metadata = {
  title: "Productos · Admin",
};

export default async function AdminProductsPage() {
  const products = await listProducts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de productos y packs digitales.
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Nuevo producto
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-foreground">Aún no hay productos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea tu primer producto digital para empezar a vender.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.coverImageUrl}
                          alt={product.title}
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                          <span aria-hidden className="text-base leading-none">📦</span>
                        </div>
                      )}
                      <div>
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {product.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">/{product.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={product.status} />
                  </td>
                  <td className="px-4 py-3">
                    {formatPrice(product.price, product.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {product.categoryId ? "Categoría" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/products/${product.id}/files`}
                        className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Archivos
                      </Link>
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Editar
                      </Link>
                      <form action={deleteProduct.bind(null, product.id)}>
                        <button
                          type="submit"
                          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          Eliminar
                        </button>
                      </form>
                    </div>
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    archived: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    draft: "Borrador",
    published: "Publicado",
    archived: "Archivado",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}
