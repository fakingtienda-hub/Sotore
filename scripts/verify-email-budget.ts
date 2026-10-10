import "dotenv/config";

import { like } from "drizzle-orm";

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import {
  DEFAULT_EMAIL_POLICY,
  getEmailUsage,
  reserveEmail,
  type EmailPolicy,
} from "../lib/server/email-guard";
import { sendEmail } from "../lib/email/send";

/**
 * Verifica el guardia de correo SIN enviar nada real: los transportes nunca se
 * tocan, se prueban las decisiones de `reserveEmail` y la bitácora.
 *
 * Correr con:
 *   npm run verify:email-budget
 *
 * Necesita `--conditions=react-server` porque `lib/server/email-guard.ts`
 * importa "server-only". Es idempotente: limpia sus propias filas al terminar.
 */

let failures = 0;

function assert(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

const STAMP = Date.now().toString(36).toUpperCase().slice(-5);
const PREFIX = "verify-email-budget-";

const mail = (slot: string) => `${PREFIX}${STAMP}-${slot}@example.com`;

/** Ventana de repetición larga: aísla los topes que se quieren probar. */
const policy = (over: Partial<EmailPolicy> = {}): EmailPolicy => ({
  ...DEFAULT_EMAIL_POLICY,
  repeatWindowMs: 60_000,
  ...over,
});

/** Deja el contador del día en cero antes de cada fase, para que las fases no
 *  se contaminen entre sí (el presupuesto es global, no por política). */
async function clearRows() {
  await db.delete(schema.emailLog).where(like(schema.emailLog.recipient, `${PREFIX}%`));
}

async function main() {
  const consoleRecipient = mail("console");
  const noQuotaRecipient = mail("no-quota");

  // ── Fase 1: `console` no gasta presupuesto ────────────────────────────────
  await clearRows();
  const consoleSend = await sendEmail({
    to: consoleRecipient,
    kind: "test",
    subject: "Prueba de presupuesto",
    html: "<p>verificación</p>",
  });
  assert("console: sendEmail devuelve ok con el proveedor de desarrollo", consoleSend.ok);
  assert("console: el proveedor reportado es console", consoleSend.provider === "console");

  const afterConsole = await reserveEmail({
    kind: "test",
    to: noQuotaRecipient,
    provider: "mailgun",
    policy: policy({ dailyLimit: 1, criticalReserve: 0 }),
  });
  assert(
    "console: con límite 1, un envío por console no ocupa el único turno",
    afterConsole.action === "send",
  );

  // ── Fase 2: idempotencia por clave (una confirmación por compra) ──────────
  await clearRows();
  const orderRecipient = mail("order");
  const dedupeKey = `order:${STAMP}:approved`;

  const first = await reserveEmail({
    kind: "order_approved",
    to: orderRecipient,
    provider: "mailgun",
    policy: policy({ dailyLimit: 50 }),
    dedupeKey,
  });
  const second = await reserveEmail({
    kind: "order_approved",
    to: orderRecipient,
    provider: "mailgun",
    policy: policy({ dailyLimit: 50 }),
    dedupeKey,
  });
  assert("dedupe: el primer correo de la orden se autoriza", first.action === "send");
  assert(
    "dedupe: el reintento con la misma clave se omite",
    second.action === "skip" && second.reason === "duplicate",
  );

  // ── Fase 3: ventana de repetición y tope horario del magic link ───────────
  await clearRows();
  const magicRecipient = mail("magic");
  const magic1 = await reserveEmail({
    kind: "magic_link",
    to: magicRecipient,
    provider: "mailgun",
    policy: policy({ dailyLimit: 50 }),
  });
  const magic2 = await reserveEmail({
    kind: "magic_link",
    to: magicRecipient,
    provider: "mailgun",
    policy: policy({ dailyLimit: 50 }),
  });
  assert("magic link: el primero se autoriza", magic1.action === "send");
  assert(
    "magic link: pedirlo otra vez dentro de la ventana se omite",
    magic2.action === "skip" && magic2.reason === "rate_limit",
  );
  assert(
    "magic link: la omisión queda registrada como tal",
    magic2.action === "skip" &&
      (await db
        .select({ id: schema.emailLog.id })
        .from(schema.emailLog)
        .where(like(schema.emailLog.recipient, `${PREFIX}%`))
      ).length === 2,
  );

  // ── Fase 4: presupuesto diario agotado ───────────────────────────────────
  await clearRows();
  const budgetPolicy = policy({ dailyLimit: 2, criticalReserve: 0, recipientPerHour: 100 });
  const spent = await reserveEmail({
    kind: "order_approved",
    to: mail("budget-1"),
    provider: "mailgun",
    policy: budgetPolicy,
  });
  const spent2 = await reserveEmail({
    kind: "order_approved",
    to: mail("budget-2"),
    provider: "mailgun",
    policy: budgetPolicy,
  });
  const overflow = await reserveEmail({
    kind: "order_approved",
    to: mail("budget-3"),
    provider: "mailgun",
    policy: budgetPolicy,
  });
  assert("cuota: los dos primeros caben en el límite 2", spent.action === "send" && spent2.action === "send");
  assert(
    "cuota: el tercero se omite por presupuesto en vez de que lo rechace el proveedor",
    overflow.action === "skip" && overflow.reason === "quota",
  );

  // ── Fase 5: tope genérico por destinatario ───────────────────────────────
  await clearRows();
  const floodRecipient = mail("flood");
  const floodPolicy = policy({ dailyLimit: 50, recipientPerHour: 2 });
  await reserveEmail({
    kind: "order_approved",
    to: floodRecipient,
    provider: "mailgun",
    policy: floodPolicy,
  });
  await reserveEmail({
    kind: "order_approved",
    to: floodRecipient,
    provider: "mailgun",
    policy: floodPolicy,
  });
  const flood3 = await reserveEmail({
    kind: "order_approved",
    to: floodRecipient,
    provider: "mailgun",
    policy: floodPolicy,
  });
  assert(
    "destinatario: pasado el tope por hora, se omite",
    flood3.action === "skip" && flood3.reason === "rate_limit",
  );

  // ── Fase 6: lectura del panel ────────────────────────────────────────────
  const usage = await getEmailUsage(policy({ dailyLimit: 2 }));
  assert("panel: getEmailUsage responde con el límite configurado", usage.dailyLimit === 2);
  assert(
    "panel: el uso de hoy se cuenta por separado del límite",
    usage.sentToday >= 0 && Array.isArray(usage.recent),
  );
}

// Sin top-level await: `tsx` emite este script como CJS.
main()
  .catch((error: unknown) => {
    console.error("Error inesperado:", error instanceof Error ? error.message : error);
    failures += 1;
  })
  .finally(async () => {
    await clearRows();
    const leftover = await db
      .select({ id: schema.emailLog.id })
      .from(schema.emailLog)
      .where(like(schema.emailLog.recipient, `${PREFIX}%`));
    console.log(`\nLimpieza: ${leftover.length} filas de prueba restantes.`);
    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FALLO(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
