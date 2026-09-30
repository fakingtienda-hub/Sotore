"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { countOrderAnomalies } from "@/lib/server/order-anomalies";
import {
  getReconcileStatus,
  runAndRecordReconciliation,
  type ReconcileStatus,
} from "@/lib/server/reconcile-log";
import type { ReconcileReport } from "@/lib/server/reconciliation";

/**
 * Acciones del panel para operar y vigilar la reconciliación de pagos. Todas
 * exigen admin: el endpoint del cron es para máquinas, esto es para humanos.
 */

/** Lo lee la página de Configuración para pintar el panel de salud. */
export async function getReconciliationPanel(): Promise<ReconcileStatus> {
  await requireAdmin();
  const anomalies = await countOrderAnomalies();
  return getReconcileStatus(anomalies);
}

/** Botón "Ejecutar ahora": corre una reconciliation a mano y devuelve el reporte. */
export async function runReconciliationNow(): Promise<{
  ok: boolean;
  error?: string;
  report?: ReconcileReport;
}> {
  await requireAdmin();
  try {
    const report = await runAndRecordReconciliation();
    revalidatePath("/admin");
    revalidatePath("/admin/sales");
    revalidatePath("/admin/settings");
    return { ok: true, report };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo ejecutar la reconciliación.",
    };
  }
}
