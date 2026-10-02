import postgres from "postgres";

import { getSession } from "@/lib/auth/session";

async function inspección(url: string) {
  if (!url) return { error: "URL ausente" };
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    const [filas] = await sql.unsafe(`
      select
        (select count(*)::int from products) as productos,
        (select count(*)::int from landing_blocks) as secciones,
        (select count(*)::int from store_settings) as settings,
        (select string_agg(slug || ':' || status, ', ') from products) as productos_detalle
    `);
    return {
      productos: filas.productos,
      secciones: filas.secciones,
      settings: filas.settings,
      productos_detalle: filas.productos_detalle,
    };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function POST(request: Request) {
  const secret = process.env.DEBUG_COMPARE_TOKEN;
  if (secret) {
    const given = request.headers.get("x-debug-token");
    if (given !== secret) return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const [enUso, alterno, prisma] = await Promise.all([
    inspección(process.env.POSTGRES_URL ?? ""),
    inspección(process.env.DATABASE_URL ?? ""),
    inspección(process.env.POSTGRES_PRISMA_URL ?? ""),
  ]);

  return Response.json({ enUso_POSTGRES_URL: enUso, alterno_DATABASE_URL: alterno, prisma: prisma });
}
