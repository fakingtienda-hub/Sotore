import Link from "next/link";

import { getDashboardStats } from "@/lib/server/actions/crm";
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

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

  const revenueLabel =
    stats.revenueByCurrency.length > 0
      ? stats.revenueByCurrency.map((r) => formatPrice(r.total, r.currency)).join(" · ")
      : formatPrice(0);

  const cards = [
    {
      label: "Ingresos aprobados",
      value: revenueLabel,
      sub: `${stats.approvedOrderCount} órdenes aprobadas`,
    },
    { label: "Ventas pendientes", value: String(stats.pendingOrderCount), sub: "Esperando pago" },
    { label: "Clientes", value: String(stats.customerCount), sub: "Cuentas creadas" },
    { label: "Descargas", value: String(stats.downloadCount), sub: "Archivos descargados" },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Resumen de ventas, clientes y descargas de la tienda.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Productos más vendidos</h2>
            <Link href="/admin/sales" className="text-sm text-muted-foreground hover:text-foreground">
              Ver ventas →
            </Link>
          </div>
          {stats.topProducts.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Aún no hay ventas aprobadas con las que calcular.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {stats.topProducts.map((p) => (
                <li key={p.title} className="flex items-center justify-between gap-4">
                  <span className="truncate text-sm font-medium text-foreground">{p.title}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {p.quantity} vendidos · {formatPrice(p.revenue, p.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Últimas órdenes</h2>
            <Link href="/admin/sales" className="text-sm text-muted-foreground hover:text-foreground">
              Todas →
            </Link>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Todavía no hay órdenes.</p>
          ) : (
            <ul className="mt-5 divide-y divide-border">
              {stats.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-foreground">{o.code}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.customerName ?? "—"} · {o.customerEmail}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[o.status] ?? statusColor.pending}`}>
                      {statusLabel[o.status] ?? o.status}
                    </span>
                    <span className="text-sm font-medium text-foreground">{formatPrice(o.total, o.currency)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}