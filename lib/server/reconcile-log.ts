import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { runReconciliation, type ReconcileReport } from "@/lib/server/reconciliation";
import { serverEnv } from "@/lib/serverEnv";

/**
 * Registro de la última corrida de la reconciliación.
 *
 * Se guarda en `store_settings` (clave/valor ya existente) para no añadir una
 * migración por algo que son dos campos. Existe por un motivo concreto: un cron
 * que falla en silencio reintroduce EXACTAMENTE el problema que la
 * reconciliación evita. Si el panel dice "última corrida: hace 3 días", sabes
 * que el problema es el cron y no la tienda. Sin esto, la única forma de saber
 * si el cron corre es hacer curl a mano.
 */

const LAST_RUN_KEY = "reconciliation:lastRun";
const HISTORY_KEY = "reconciliation:history";
const HISTORY_LIMIT = 10;

export type ReconcileStatus = {
  /** El endpoint está activo (hay `RECONCILE_SECRET`). */
  enabled: boolean;
  lastRun: (StoredRun & { undeliveredAfterRun: number }) | null;
  /** Horas desde la última corrida, para el aviso de "no corre". */
  hoursSinceLastRun: number | null;
  history: StoredRun[];
};

type StoredRun = {
  ranAt: string;
  /** Entregas reparadas en esa corrida (pago OK, acceso que faltaba). */
  repaired: number;
  /** Pagos recuperados de vuelta (webhook perdido o aprobación tardía). */
  recovered: number;
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const [row] = await db
      .select({ value: schema.storeSettings.value })
      .from(schema.storeSettings)
      .where(eq(schema.storeSettings.key, key))
      .limit(1);
    return (row?.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.storeSettings)
    .values({ key, value: value as typeof schema.storeSettings.$inferInsert["value"] })
    .onConflictDoUpdate({
      target: schema.storeSettings.key,
      set: { value: value as typeof schema.storeSettings.$inferInsert["value"], updatedAt: new Date() },
    });
}

/** Resumen contable del reporte, para el historial y la salud del cron. */
function summarize(report: ReconcileReport) {
  return {
    repaired: report.delivery.repaired.length,
    recovered: report.payments.approved.length + report.payments.expiredRecovered.length,
  };
}

export async function recordReconcileRun(report: ReconcileReport): Promise<void> {
  const { repaired, recovered } = summarize(report);
  const entry: StoredRun = { ranAt: report.ranAt, repaired, recovered };

  const history = await readJson<StoredRun[]>(HISTORY_KEY, []);
  const next = [entry, ...history.filter((h) => h.ranAt !== entry.ranAt)].slice(0, HISTORY_LIMIT);

  await writeJson(LAST_RUN_KEY, entry);
  await writeJson(HISTORY_KEY, next);
}

export async function getReconcileStatus(
  postRunAnomalies: { undelivered: number; amount_mismatch: number },
): Promise<ReconcileStatus> {
  const lastRun = await readJson<StoredRun | null>(LAST_RUN_KEY, null);
  const history = await readJson<StoredRun[]>(HISTORY_KEY, []);

  const hoursSinceLastRun = lastRun
    ? Math.floor((Date.now() - new Date(lastRun.ranAt).getTime()) / (60 * 60 * 1000))
    : null;

  return {
    enabled: Boolean(serverEnv.reconcileSecret),
    lastRun: lastRun ? { ...lastRun, undeliveredAfterRun: postRunAnomalies.undelivered } : null,
    hoursSinceLastRun,
    history,
  };
}

/** Corre una corrida y la registra. Lo usa el endpoint y el botón del panel. */
export async function runAndRecordReconciliation(): Promise<ReconcileReport> {
  const report = await runReconciliation();
  await recordReconcileRun(report);
  return report;
}
