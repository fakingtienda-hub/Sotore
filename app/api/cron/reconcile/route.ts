import { runAndRecordReconciliation } from "@/lib/server/reconcile-log";
import { safeTokenEqual } from "@/lib/server/safe-token";
import { serverEnv } from "@/lib/serverEnv";

export const dynamic = "force-dynamic";
/* Barrido de órdenes + recuperación de pagos: proceso por lotes que puede
   exceder el timeout por defecto. */
export const maxDuration = 60;

/**
 * Reconciliación de pagos. Pensada para que la llame un cron externo
 * (cron-job.org, un Workflow de n8n/Make, un cron de tu hosting…) y no desde el
 * navegador.
 *
 *   curl -H "Authorization: Bearer $RECONCILE_SECRET" \
 *        https://tu-dominio.com/api/cron/reconcile
 *
 * Se acepta el secreto en `Authorization: Bearer` o en `x-reconcile-secret`.
 * Correrla más de una vez por hora es inocuo: todo el trabajo es idempotente.
 */
function isAuthorized(request: Request): boolean {
  const secret = serverEnv.reconcileSecret;
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const header = request.headers.get("x-reconcile-secret") ?? "";
  return safeTokenEqual(bearer, secret) || safeTokenEqual(header, secret);
}

export async function POST(request: Request) {
  if (!serverEnv.reconcileSecret) {
    return Response.json(
      {
        error:
          "RECONCILE_SECRET no configurado; reconciliación desactivada. Define la variable de entorno.",
      },
      { status: 503 },
    );
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const report = await runAndRecordReconciliation();
  return Response.json(report);
}

// GET para que puedas dispararla desde el navegador o un ping de uptime.
export async function GET(request: Request) {
  return POST(request);
}
