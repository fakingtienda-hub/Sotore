import { sql } from "drizzle-orm";

import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { listCoupons } from "@/lib/server/actions/coupons";
import { listSales } from "@/lib/server/actions/crm";
import { getStoreSettings } from "@/lib/server/actions/settings";
import { countOrderAnomalies } from "@/lib/server/order-anomalies";

async function medir<T>(nombre: string, fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    return { nombre, ok: true, ms, detalle: Array.isArray(r) ? `array(${r.length})` : typeof r };
  } catch (e) {
    const err = e as Error & { code?: string; detail?: string };
    return {
      nombre,
      ok: false,
      ms: Date.now() - t0,
      error: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack?.split("\n").slice(1, 4).join(" | "),
    };
  }
}

export async function POST() {
  const session = await getSession();
  if (session?.user?.role !== "admin") return Response.json({ error: "No autorizado" }, { status: 401 });

  const [conexion, simple, sales, coupons, settings, anomalias] = await Promise.all([
    medir("pg_info", async () => {
      const [r] = await db.execute(sql`
        select current_setting('max_connections') as max_conn,
               (select count(*) from pg_stat_activity) as conexiones,
               (select count(*) from pg_stat_activity where state = 'active') as activas,
               (select count(*) from pg_stat_activity where state = 'idle') as inactivas,
               current_database() as db,
               inet_server_addr()::text as servidor,
               version() as version
      `);
      return r as unknown;
    }),
    medir("select_simple", () => db.select({ id: schema.users.id }).from(schema.users).limit(1)),
    medir("listSales", () => listSales()),
    medir("listCoupons", () => listCoupons()),
    medir("getStoreSettings", () => getStoreSettings()),
    medir("countOrderAnomalies", () => countOrderAnomalies()),
  ]);

  return Response.json({ conexion, simple, sales, coupons, settings, anomalias }, { status: 200 });
}
