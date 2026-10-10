import "server-only";

import { and, count, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Guardia de correo saliente.
 *
 * El plan Free de Mailgun son 100 correos al día, y ese presupuesto es
 * compartido por TODO: el correo de una compra compite con el magic link de
 * cualquier visitante. Como el magic link se dispara a petición de cualquiera,
 * un tercero puede agotar la cuota y dejar a un comprador sin su confirmación.
 *
 * Todo `sendEmail` pasa por `reserveEmail` antes de hablar con el proveedor, así
 * que las reglas viven en un solo sitio y ningún correo futuro las esquiva.
 *
 * Modelo de decisión:
 *   - `critical` (compra, magic link, reseteo): usa el límite completo.
 *   - `manual` (test del panel): igual, pero se etiqueta para auditarlo.
 *   - `bulk` (futuro marketing/recordatorios): se corta antes, dejando
 *     `criticalReserve` correos libres para lo que de verdad importa.
 *   - La cuota NUNCA es un permiso para enviar sin tope: al llegar al límite
 *     duro se omite todo (el proveedor lo rechazaría igual) y se registra.
 */

export type EmailKind = "order_approved" | "magic_link" | "password_reset" | "test";

export type EmailPriority = "critical" | "manual" | "bulk";

/** `guard_error` no llega a la tabla (si el guardia falla es porque la BD no
 *  responde), pero forma parte del vocabulario de decisión que ven los callers. */
export type SkipReason = "quota" | "duplicate" | "rate_limit" | "circuit" | "guard_error";

export type EmailLogStatus =
  | "pending"
  | "sent"
  | "failed"
  | "skipped_quota"
  | "skipped_duplicate"
  | "skipped_rate_limit"
  | "skipped_circuit"
  | "skipped_guard_error";

/** Estados que ocupan un turno del presupuesto (enviado o en vuelo). */
const OCCUPIES_QUOTA: EmailLogStatus[] = ["pending", "sent"];

const SKIP_STATUS: Record<SkipReason, EmailLogStatus> = {
  quota: "skipped_quota",
  duplicate: "skipped_duplicate",
  rate_limit: "skipped_rate_limit",
  circuit: "skipped_circuit",
  guard_error: "skipped_guard_error",
};

/** Prioridad de cada tipo de correo. Añadir un tipo aquí es obligatorio. */
export const EMAIL_KIND_PRIORITY: Record<EmailKind, EmailPriority> = {
  order_approved: "critical",
  password_reset: "critical",
  magic_link: "critical",
  test: "manual",
};

export function priorityOf(kind: EmailKind): EmailPriority {
  return EMAIL_KIND_PRIORITY[kind];
}

export type EmailPolicy = {
  /** Correos que el proveedor acepta por día (Free de Mailgun = 100). */
  dailyLimit: number;
  /** Turnos que se reservan para los `critical` frente a los `bulk`. */
  criticalReserve: number;
  /** Ventana mínima entre dos correos del mismo tipo al mismo destinatario. */
  repeatWindowMs: number;
  magicLinkPerHour: number;
  magicLinkPerDay: number;
  /** Tope genérico por destinatario, para cualquier tipo. */
  recipientPerHour: number;
};

export const DEFAULT_EMAIL_POLICY: EmailPolicy = {
  dailyLimit: 100,
  criticalReserve: 20,
  repeatWindowMs: 5 * 60_000,
  magicLinkPerHour: 3,
  magicLinkPerDay: 10,
  recipientPerHour: 10,
};

/**
 * Tipos con ventana de repetición: un doble clic o un reintento impaciente no
 * deben gastar dos envíos del mismo presupuesto.
 *
 * NO incluye `order_approved` porque ahí la protección es otra (una clave de
 * idempotencia permanente por orden, que es exactamente lo que se quiere: una
 * sola confirmación por compra, para siempre).
 */
const REPEAT_GUARDED: EmailKind[] = ["magic_link", "password_reset"];

export type EmailDecision =
  | { action: "send"; logId: string }
  | { action: "skip"; reason: SkipReason; logId: string };

/**
 * Día UTC, que es cuando Mailgun reinicia su contador. Usar la zona local haría
 * que el presupuesto se renovara a una hora distinta a la del proveedor.
 */
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Corte de circuito tras un 429 del proveedor. Es estado por instancia, igual
 * que el throttle de `expireStalePendingOrders`: en serverless cada instancia
 * caliente lo mantiene, y el peor caso es un intento extra por instancia.
 */
const CIRCUIT_BREAKER_MS = 60_000;
let circuitOpenUntil = 0;

export function openEmailCircuit(ms: number = CIRCUIT_BREAKER_MS): void {
  circuitOpenUntil = Date.now() + ms;
}

export function resetEmailCircuit(): void {
  circuitOpenUntil = 0;
}

export function isEmailCircuitOpen(): boolean {
  return circuitOpenUntil > Date.now();
}

/** Transacción de Drizzle, derivada del propio cliente para no acoplar el
 *  guardia a un tipo concreto de driver si algún día cambia el pool. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ReserveInput = {
  kind: EmailKind;
  to: string;
  /** Proveedor efectivo con el que se intentará el envío. */
  provider: string;
  policy: EmailPolicy;
  dedupeKey?: string;
  orderId?: string;
};

/**
 * Decide si un correo puede salir y, en el mismo acto, deja la fila en
 * `email_log`. La lectura y la escritura van en una transacción con un lock por
 * destinatario: sin él, dos peticiones simultáneas de magic link (justo el
 * escenario de abuso) leerían "0 enviados" a la vez y pasarían las dos.
 */
export async function reserveEmail(input: ReserveInput): Promise<EmailDecision> {
  const { kind, to, provider, policy, dedupeKey, orderId } = input;
  const priority = priorityOf(kind);
  const recipient = to.trim().toLowerCase();
  const now = Date.now();

  // El proveedor `console` es de desarrollo: no gasta cuota real, así que ni
  // cuenta ni se bloquea (permite probar el flujo entero sin tocar los 100).
  const consumesQuota = provider !== "console";

  const insertLog = async (tx: Tx, status: EmailLogStatus, error?: string): Promise<string> => {
    const [row] = await tx
      .insert(schema.emailLog)
      .values({
        kind,
        priority,
        recipient,
        status,
        provider,
        dedupeKey: dedupeKey ?? null,
        orderId: orderId ?? null,
        error: error ?? null,
      })
      .returning({ id: schema.emailLog.id });
    return row.id;
  };

  const decision = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`email:${recipient}`}))`);

    // 1) Circuito abierto: el proveedor ya nos dijo que está saturado. Se
    //    registra igual, para que el panel no parezca congelado.
    if (consumesQuota && isEmailCircuitOpen()) {
      const logId = await insertLog(tx, SKIP_STATUS.circuit, "Circuito abierto tras un 429 del proveedor.");
      return { action: "skip" as const, reason: "circuit" as const, logId };
    }

    // 2) Presupuesto del día. Los `bulk` se cortan antes para no comerse los
    //    turnos reservados a los correos que el cliente está esperando.
    if (consumesQuota) {
      const [used] = await tx
        .select({ n: count() })
        .from(schema.emailLog)
        .where(
          and(
            gte(schema.emailLog.createdAt, startOfUtcDay()),
            inArray(schema.emailLog.status, OCCUPIES_QUOTA),
            ne(schema.emailLog.provider, "console"),
          ),
        );
      const usedToday = Number(used?.n ?? 0);
      const ceiling =
        priority === "bulk"
          ? Math.max(0, policy.dailyLimit - policy.criticalReserve)
          : policy.dailyLimit;

      if (usedToday >= ceiling) {
        const logId = await insertLog(
          tx,
          SKIP_STATUS.quota,
          `Presupuesto diario alcanzado (${usedToday}/${policy.dailyLimit}).`,
        );
        return { action: "skip" as const, reason: "quota" as const, logId };
      }
    }

    // 3) Idempotencia por operación: `order:{id}:approved` garantiza un solo
    //    correo por compra aunque el webhook reintente o la reconciliación
    //    vuelva a aprobar la misma orden.
    if (dedupeKey) {
      const [dup] = await tx
        .select({ n: count() })
        .from(schema.emailLog)
        .where(
          and(
            eq(schema.emailLog.dedupeKey, dedupeKey),
            inArray(schema.emailLog.status, OCCUPIES_QUOTA),
          ),
        );
      if (Number(dup?.n ?? 0) > 0) {
        const logId = await insertLog(tx, SKIP_STATUS.duplicate, `Ya se envió con la clave ${dedupeKey}.`);
        return { action: "skip" as const, reason: "duplicate" as const, logId };
      }
    }

    // 4) Ventana de repetición + topes por destinatario. El magic link lleva
    //    los topes más estrictos porque lo puede disparar un tercero a voluntad;
    //    el reseteo de contraseña solo necesita la ventana corta.
    if (REPEAT_GUARDED.includes(kind)) {
      const checks: Array<{ since: Date; cap: number; label: string }> = [
        {
          since: new Date(now - policy.repeatWindowMs),
          cap: 1,
          label: `${Math.round(policy.repeatWindowMs / 60_000)} min`,
        },
      ];
      if (kind === "magic_link") {
        checks.push(
          { since: new Date(now - 60 * 60_000), cap: policy.magicLinkPerHour, label: "1 h" },
          { since: startOfUtcDay(), cap: policy.magicLinkPerDay, label: "24 h" },
        );
      }
      for (const check of checks) {
        const [sent] = await tx
          .select({ n: count() })
          .from(schema.emailLog)
          .where(
            and(
              eq(schema.emailLog.recipient, recipient),
              eq(schema.emailLog.kind, kind),
              gte(schema.emailLog.createdAt, check.since),
              inArray(schema.emailLog.status, OCCUPIES_QUOTA),
            ),
          );
        if (Number(sent?.n ?? 0) >= check.cap) {
          const logId = await insertLog(
            tx,
            SKIP_STATUS.rate_limit,
            `Límite de ${kind} por correo alcanzado (${check.cap} por ${check.label}).`,
          );
          return { action: "skip" as const, reason: "rate_limit" as const, logId };
        }
      }
    }

    // 5) Tope genérico por destinatario: una dirección que recibe decenas de
    //    correos por hora es un error de código o un abuso, no un cliente.
    const [perRecipient] = await tx
      .select({ n: count() })
      .from(schema.emailLog)
      .where(
        and(
          eq(schema.emailLog.recipient, recipient),
          gte(schema.emailLog.createdAt, new Date(now - 60 * 60_000)),
          inArray(schema.emailLog.status, OCCUPIES_QUOTA),
        ),
      );
    if (Number(perRecipient?.n ?? 0) >= policy.recipientPerHour) {
      const logId = await insertLog(
        tx,
        SKIP_STATUS.rate_limit,
        `Límite por destinatario alcanzado (${policy.recipientPerHour} por hora).`,
      );
      return { action: "skip" as const, reason: "rate_limit" as const, logId };
    }

    // Turno reservado: el correo queda en `pending` y ocupa presupuesto desde
    // ya, de modo que un fallo de proceso no libere un turno que igual se gastó.
    const logId = await insertLog(tx, "pending");
    return { action: "send" as const, logId };
  });

  return decision;
}

/**
 * Cierra la fila abierta por `reserveEmail` con el resultado real. Es best-effort
 * a propósito: si el correo ya salió, un fallo al escribir la bitácora no debe
 * convertir un envío correcto en un error para quien lo pidió.
 */
export async function settleEmail(
  logId: string,
  result: { ok: boolean; provider: string; error?: string },
): Promise<void> {
  try {
    await db
      .update(schema.emailLog)
      .set(
        result.ok
          ? { status: "sent", provider: result.provider }
          : {
              status: "failed",
              provider: result.provider,
              error: (result.error ?? "Error desconocido.").slice(0, 500),
            },
      )
      .where(eq(schema.emailLog.id, logId));
  } catch {
    // La fila queda en `pending`, que sigue ocupando presupuesto: el registro
    // se vuelve conservador en vez de regalar cuota.
  }
}

export type EmailUsage = {
  /** Correos que ya ocuparon turno hoy (enviados o en vuelo). */
  sentToday: number;
  /** Omisiones de hoy, por motivo. */
  skippedToday: { duplicate: number; rate_limit: number; quota: number; circuit: number };
  failedToday: number;
  dailyLimit: number;
  criticalReserve: number;
  circuitOpen: boolean;
  recent: Array<{
    id: string;
    kind: string;
    priority: string;
    recipient: string;
    status: string;
    provider: string;
    error: string | null;
    createdAt: Date;
  }>;
};

/** Resumen para el panel: cuánto se llevó gastado hoy y qué se descartó. */
export async function getEmailUsage(policy: EmailPolicy): Promise<EmailUsage> {
  const dayStart = startOfUtcDay();

  const [totals] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${schema.emailLog.status} in ('pending', 'sent') and ${schema.emailLog.provider} <> 'console')`,
      duplicate: sql<number>`count(*) filter (where ${schema.emailLog.status} = 'skipped_duplicate')`,
      rateLimit: sql<number>`count(*) filter (where ${schema.emailLog.status} = 'skipped_rate_limit')`,
      quota: sql<number>`count(*) filter (where ${schema.emailLog.status} = 'skipped_quota')`,
      circuit: sql<number>`count(*) filter (where ${schema.emailLog.status} = 'skipped_circuit')`,
      failed: sql<number>`count(*) filter (where ${schema.emailLog.status} = 'failed')`,
    })
    .from(schema.emailLog)
    .where(gte(schema.emailLog.createdAt, dayStart));

  const recent = await db
    .select({
      id: schema.emailLog.id,
      kind: schema.emailLog.kind,
      priority: schema.emailLog.priority,
      recipient: schema.emailLog.recipient,
      status: schema.emailLog.status,
      provider: schema.emailLog.provider,
      error: schema.emailLog.error,
      createdAt: schema.emailLog.createdAt,
    })
    .from(schema.emailLog)
    .orderBy(sql`${schema.emailLog.createdAt} desc`)
    .limit(10);

  return {
    sentToday: Number(totals?.sent ?? 0),
    skippedToday: {
      duplicate: Number(totals?.duplicate ?? 0),
      rate_limit: Number(totals?.rateLimit ?? 0),
      quota: Number(totals?.quota ?? 0),
      circuit: Number(totals?.circuit ?? 0),
    },
    failedToday: Number(totals?.failed ?? 0),
    dailyLimit: policy.dailyLimit,
    criticalReserve: policy.criticalReserve,
    circuitOpen: isEmailCircuitOpen(),
    recent,
  };
}
