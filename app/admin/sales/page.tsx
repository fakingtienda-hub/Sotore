import { listProductsForSales, listSales } from "@/lib/server/actions/crm";
import { SalesFilters } from "./_components/sales-filters";
import { formatDate, formatPrice } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  declined: "Rechazada",
  voided: "Anulada",
  error: "Error",
};

const statusColor: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  declined: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  voided: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

function first(items: string | string[] | undefined): string | undefined {
  if (Array.isArray(items)) return items[0];
  return items;
}

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; productId?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const filter = {
    q: first(sp.q),
    status: first(sp.status),
    productId: first(sp.productId),
    from: first(sp.from),
    to: first(sp.to),
  };

  const [sales, products] = await Promise.all([listSales(filter), listProductsForSales()]);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Ventas</h1>
      <p className="mt-2 text-muted-foreground">
        Órdenes de la tienda con filtros por fecha, producto, estado y cliente.
      </p>

      <SalesFilters products={products} initial={filter} />

      {sales.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-foreground">Sin ventas con esos filtros</p>
          <p className="mt-1 text-sm text-muted-foreground">Probá quitar filtros para ver más resultados.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Orden</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-foreground">{s.code}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(s.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{s.customerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{s.customerEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.items.length > 0 ? (
                      <div>
                        {s.items.map((i) => (
                          <p key={i.productTitle} className="text-foreground">
                            {i.productTitle}
                            {i.quantity > 1 ? ` ×${i.quantity}` : ""}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[s.status] ?? statusColor.pending}`}>
                      {statusLabel[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground">
                    {formatPrice(s.total, s.currency)}
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