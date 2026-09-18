import Link from "next/link";
import { notFound } from "next/navigation";

import { getCustomerDetail } from "@/lib/server/actions/crm";
import { formatDate, formatPrice } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  declined: "Rechazada",
  voided: "Anulada",
  error: "Error",
};

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomerDetail(id);
  if (!customer) notFound();

  return (
    <div>
      <Link href="/admin/customers" className="text-sm text-muted-foreground hover:text-foreground">
        ← Volver a clientes
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{customer.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.email} · Registrado el {formatDate(customer.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Compras ({customer.orders.length})</h2>
          {customer.orders.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Este cliente aún no tiene órdenes.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {customer.orders.map((o) => (
                <li key={o.id} className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm font-semibold text-foreground">{o.code}</span>
                    <span className="text-sm font-medium text-foreground">{formatPrice(o.total, o.currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(o.createdAt)}</span>
                    <span className="uppercase text-muted-foreground">{statusLabel[o.status] ?? o.status}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {o.items.map((item) => (
                      <li key={`${o.id}-${item.productTitle}`} className="text-sm text-foreground">
                        {item.productTitle}
                        <span className="text-muted-foreground"> · {item.quantity} × {formatPrice(item.unitPrice, o.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Descargas ({customer.downloads.length})</h2>
          {customer.downloads.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Este cliente aún no descargó archivos.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {customer.downloads.map((d, i) => (
                <li key={i} className="py-3">
                  <p className="text-sm font-medium text-foreground">{d.fileName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.productTitle} · {formatDate(d.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}