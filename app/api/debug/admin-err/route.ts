import { sql } from "drizzle-orm";

import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/serverEnv";

/** Solo la forma de la URL: nunca la password. Sirve para saber si la app
 *  apunta a la conexion directa de Postgres o a un pooler, que es lo que
 *  decide si el pool se puede compartido entre lambdas. */
function forma(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    return {
      puerto: u.port || "(default)",
      esPooler: /pooler|pgbouncer|supavisor|neon\.tech/.test(host),
      esSupabase: /supabase/.test(host),
      esNeon: /neon\.tech/.test(host),
      tipoHost: host.replace(/[a-z]{16,}/gi, "<project-ref>"),
    };
  } catch {
    return { error: "URL no parseable" };
  }
}

async function medir<T>(nombre: string, fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    await fn();
    return { nombre, ok: true, ms: Date.now() - t0 };
  } catch (e) {
    const err = e as Error & { code?: string; cause?: { message?: string; code?: string } };
    return {
      nombre,
      ok: false,
      ms: Date.now() - t0,
      error: err.message,
      cause: err.cause?.message,
      causeCode: err.cause?.code,
      code: err.code,
    };
  }
}

export async function POST() {
  const session = await getSession();
  if (session?.user?.role !== "admin") return Response.json({ error: "No autorizado" }, { status: 401 });

  const info = await db.execute(sql`
    select current_setting('max_connections') as max_conn,
           (select count(*) from pg_stat_activity) as conexiones,
           (select count(*) from pg_stat_activity where state = 'active') as activas,
           (select count(*) from pg_stat_activity where state = 'idle') as inactivas,
           (select count(*) from pg_stat_activity where state = 'idle in transaction') as enTransaccion,
           current_database() as base,
           version() as version
  `);

  // 12 queries en paralelo: imita lo que hacen varias peticiones simultaneas.
  const paralelo = await Promise.all(
    Array.from({ length: 12 }, (_, i) => medir(`q${i}`, () => db.execute(sql`select 1 as n`))),
  );
  const tiempos = paralelo.map((p) => p.ms).sort((a, b) => a - b);
  const fallidos = paralelo.filter((p) => !p.ok);

  return Response.json({
    databaseUrlEnUso: forma(serverEnv.databaseUrl),
    postgresUrlAlterno: forma(process.env.POSTGRES_URL ?? ""),
    poolMaxConfigurado: serverEnv.databasePoolMax,
    pg: info,
    paralelo: {
      total: paralelo.length,
      ok: paralelo.length - fallidos.length,
      fallidos: fallidos.map((f) => ({ error: f.error, code: f.code })),
      msMin: tiempos[0],
      msMediana: tiempos[Math.floor(tiempos.length / 2)],
      msMax: tiempos[tiempos.length - 1],
    },
  });
}
