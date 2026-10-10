import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getLibraryOrderNotice } from "@/lib/server/library-notice";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { LibraryOrderNotice } from "./_components/library-order-notice";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireUser();

  const purchases = await db
    .select({
      purchaseId: schema.purchases.id,
      grantedAt: schema.purchases.grantedAt,
      productId: schema.products.id,
      title: schema.products.title,
      slug: schema.products.slug,
      coverImageUrl: schema.products.coverImageUrl,
      currency: schema.products.currency,
      price: schema.products.price,
    })
   .from(schema.purchases)
     .innerJoin(schema.products, eq(schema.purchases.productId, schema.products.id))
     .where(and(eq(schema.purchases.userId, user.id), eq(schema.purchases.status, "active")))
     .orderBy(desc(schema.purchases.grantedAt));

   const active = purchases;

  // Órdenes recientes aún no reflejadas en la biblioteca. Sin esto, un cliente
  // que pagó y cuya entrega se retrasó leía "no tienes productos · Ir a la
  // tienda", o sea: la app pidiéndole que pagara otra vez.
  const notice = await getLibraryOrderNotice(user.id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Mi biblioteca</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tus productos comprados con acceso a descargas.</p>

      {notice ? <LibraryOrderNotice notice={notice} /> : null}

      {active.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-7xl opacity-40" aria-hidden>📦</p>
          {notice ? (
            <>
              {/* Hay una compra en camino: NO ofrecer comprar otra vez. */}
              <p className="mt-4 text-sm text-muted-foreground">
                Tu compra aparecerá aquí en cuanto se active el acceso.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-muted-foreground">Aún no tienes productos en tu biblioteca.</p>
              <Link href="/" className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                Ir a la tienda
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((item) => (
            <Link
              key={item.purchaseId}
              href={`/library/${item.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              {item.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.coverImageUrl} alt={item.title} className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-secondary text-5xl opacity-40" aria-hidden>📦</div>
              )}
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h2 className="font-display text-base font-semibold group-hover:text-primary">{item.title}</h2>
                <p className="text-xs text-muted-foreground">Comprado {formatDate(item.grantedAt!)}</p>
                <p className="mt-auto pt-2 text-sm font-semibold text-foreground">{formatPrice(item.price, item.currency)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
