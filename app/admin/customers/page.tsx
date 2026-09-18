import Link from "next/link";

import { listCustomers } from "@/lib/server/actions/crm";
import { formatDate, formatPrice } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const customers = await listCustomers(q);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Clientes</h1>
      <p className="mt-2 text-muted-foreground">
        Mini CRM: compras, total gastado y actividad por cliente.
      </p>

      <form method="GET" className="mt-6 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre o email…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Buscar
        </button>
      </form>

      {customers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-foreground">No hay clientes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Los clientes se crean automáticamente al completar un checkout.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Compras</th>
                <th className="px-4 py-3">Total gastado</th>
                <th className="px-4 py-3">Última compra</th>
                <th className="px-4 py-3">Descargas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${c.id}`} className="group">
                      <p className="font-medium text-foreground group-hover:text-primary">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">{c.orderCount}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatPrice(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.downloadCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}