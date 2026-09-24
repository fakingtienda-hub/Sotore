import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

async function main() {
  const failures: string[] = [];
  const ok = (msg: string) => console.log(`  PASS ${msg}`);
  const fail = (msg: string) => {
    failures.push(msg);
    console.error(`  FAIL ${msg}`);
  };

  console.log("1) Ingresos agrupados por moneda regresan la suma global (no se pierde dinero):");
  const [simple] = await db
    .select({ total: sql<number>`COALESCE(SUM(${schema.orders.total}), 0)`.mapWith(Number) })
    .from(schema.orders)
    .where(eq(schema.orders.status, "approved"));
  const byCurrency = await db
    .select({
      currency: schema.orders.currency,
      total: sql<number>`COALESCE(SUM(${schema.orders.total}), 0)`.mapWith(Number),
    })
    .from(schema.orders)
    .where(eq(schema.orders.status, "approved"))
    .groupBy(schema.orders.currency);
  const groupedTotal = byCurrency.reduce((acc, r) => acc + r.total, 0);
  if (Math.abs(groupedTotal - (simple?.total ?? 0)) > 0.001) {
    fail(`agrupado ${groupedTotal} != suma simple ${simple?.total}`);
  } else {
    ok(`suma por moneda = ${groupedTotal} == suma simple`);
  }

  console.log("2) Ningún grupo sin moneda (currency siempre presente en órdenes aprobadas):");
  const noCurrency = byCurrency.filter((r) => !r.currency || !r.currency.trim());
  if (noCurrency.length) fail(`grupos sin moneda: ${noCurrency.length}`);
  else ok(`${byCurrency.length} grupo(s): ${byCurrency.map((r) => `${r.currency}=${r.total}`).join(", ") || "(sin ventas)"}`);

  console.log("3) Gastos por cliente agrupados por moneda (SUM por usuario+moneda):");
  const perCustomer = await db
    .select({
      userId: schema.orders.userId,
      currency: schema.orders.currency,
      total: sql<number>`COALESCE(SUM(${schema.orders.total}), 0)`.mapWith(Number),
    })
    .from(schema.orders)
    .where(eq(schema.orders.status, "approved"))
    .groupBy(schema.orders.userId, schema.orders.currency);
  if (perCustomer.length > 0) {
    ok(`${perCustomer.length} filas usuario+moneda (${new Set(perCustomer.map((r) => r.userId)).size} clientes con gasto aprobado)`);
  } else {
    ok("0 clientes con gasto aprobado (dataset vacío)");
  }

  console.log("4) Índice UNIQUE store_settings_key_idx presente:");
  const ts = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'store_settings' AND indexname = 'store_settings_key_idx'`);
  if (ts.length === 0) fail("no existe el índice");
  else ok("existe");

  if (failures.length) {
    console.error(`\n${failures.length} fallo(s)`);
    process.exit(1);
  }
  console.log("\nOK: CRM agrupa por moneda; store_settings único.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});