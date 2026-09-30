import Link from "next/link";

import { getDashboardStats } from "@/lib/server/actions/crm";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { OrderStatusCell } from "./_components/order-status";

export const dynamic = "force-dynamic";

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

  // Sólo aparece si hay algo que mirar. Una caja permanente acabaría enseñando
  // a ignorar la alerta, que es justo lo que no puede pasar con dinero cobrado
  // y producto sin entregar.
  const { undelivered, amount_mismatch: amountMismatch } = stats.anomalies;
  const hasAnomalies = undelivered > 0 || amountMismatch > 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Resumen de ventas, clientes y descargas de la tienda.
      </p>

      {hasAnomalies ? (
        <div
          role="alert"
          className="mt-6 rounded-2xl border-2 border-red-300 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="font-display text-base font-semibold text-red-900 dark:text-red-100">
            Hay pagos que necesitan atención
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-800 dark:text-red-200">
            {undelivered > 0 ? (
              <li>
                <strong>{undelivered}</strong> pago(s) aprobado(s) sin acceso entregado. La
                reconciliación lo repara sola; si persiste, revisa los logs de entrega.
              </li>
            ) : null}
            {amountMismatch > 0 ? (
              <li>
                <strong>{amountMismatch}</strong> pago(s) con monto o moneda que no coinciden con
                la orden. <strong>No se reparan solos</strong>: hay que revisarlos a mano.
              </li>
            ) : null}
          </ul>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {undelivered > 0 ? (
              <Link
                href="/admin/sales?flag=undelivered"
                className="font-medium underline underline-offset-2"
              >
                Ver sin entregar →
              </Link>
            ) : null}
            {amountMismatch > 0 ? (
              <Link
                href="/admin/sales?flag=amount_mismatch"
                className="font-medium underline underline-offset-2"
              >
                Ver montos discrepantes →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

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
                    <OrderStatusCell status={o.status} flags={o.flags} />
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