import "dotenv/config";

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { eq, inArray } from "drizzle-orm";

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { confirmOrderWithWompi } from "../lib/server/reconciliation";

/**
 * Verifica la confirmación de pago A DEMANDA (nivel 3 de la reconciliación),
 * sin tocar la pasarela real: se levanta un sink local que imita
 * `GET /transactions/{id}` y `GET /transactions?from&to`, y se apunta la app
 * ahí con `WOMPI_API_URL`.
 *
 * Correr con:
 *   npm run verify:payment-confirm
 *
 * Idempotente: crea un usuario y unas órdenes propios y los borra al terminar.
 */

const PORT = Number(process.env.WOMPI_SINK_PORT ?? "4599");
const STAMP = Date.now().toString(36).toUpperCase().slice(-5);

let failures = 0;
function assert(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

/* --- Sink de Wompi ------------------------------------------------------- */

let requests = 0;
/** Simula una caída de Wompi: la consulta debe fallar sin aprobar nada. */
let failMode = false;
/** Simula el 401 que la API real da al LISTAR transacciones con la llave pública. */
let listUnauthorized = false;
let txStatus = "APPROVED";
let txAmount: number | null = null;
let sinkReference = "";
let sinkTxId = "";

function transaction() {
  return {
    id: sinkTxId,
    reference: sinkReference,
    status: txStatus,
    amount_in_cents: txAmount,
    currency: "COP",
    created_at: new Date().toISOString(),
  };
}

const sink = createServer((req, res) => {
  requests += 1;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  res.setHeader("content-type", "application/json");
  if (failMode) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "sink caído" }));
    return;
  }
  if (url.pathname === "/transactions") {
    if (listUnauthorized) {
      res.statusCode = 401;
      res.end(
        JSON.stringify({ error: { type: "INVALID_ACCESS_TOKEN", reason: "Solicitud no autorizada" } }),
      );
      return;
    }
    res.end(JSON.stringify({ data: [transaction()] }));
    return;
  }
  if (url.pathname.startsWith("/transactions/")) {
    const id = decodeURIComponent(url.pathname.slice("/transactions/".length));
    res.end(JSON.stringify({ data: { ...transaction(), id } }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({}));
});

/* --- Datos de prueba ----------------------------------------------------- */

const userId = randomUUID();
const orderIds: string[] = [];

async function createOrder(opts: {
  code: string;
  total: number;
  gatewayReference?: string;
}): Promise<string> {
  const id = randomUUID();
  orderIds.push(id);
  await db.insert(schema.orders).values({
    id,
    code: opts.code,
    userId,
    status: "pending",
    subtotal: opts.total,
    discount: 0,
    total: opts.total,
    currency: "COP",
    ownerToken: randomUUID(),
    gatewayReference: opts.gatewayReference ?? null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  return id;
}

async function statusOf(code: string): Promise<string | null> {
  const [row] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.code, code))
    .limit(1);
  return row?.status ?? null;
}

async function cleanup() {
  await db.delete(schema.downloads).where(eq(schema.downloads.userId, userId));
  await db.delete(schema.purchases).where(eq(schema.purchases.userId, userId));
  if (orderIds.length > 0) {
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds));
    await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));
}

async function main() {
  await new Promise<void>((resolve) => sink.listen(PORT, "127.0.0.1", resolve));

  const [product] = await db
    .select({ id: schema.products.id, price: schema.products.price })
    .from(schema.products)
    .limit(1);
  if (!product) throw new Error("No hay productos en la BD.");

  await db.insert(schema.users).values({
    id: userId,
    name: "Verificación confirmación",
    email: `verify-payment-${STAMP}@example.com`,
    role: "customer",
    status: "active",
  });

  const total = Math.round(product.price) || 10000;

  /* --- Caso A: pago aprobado sin webhook (empareja por `reference`) ------ */
  const codeA = `FS-VER${STAMP}-A`;
  const idA = await createOrder({ code: codeA, total });
  await db.insert(schema.orderItems).values({
    orderId: idA,
    productId: product.id,
    productTitleSnapshot: "Verificación",
    unitPrice: total,
    quantity: 1,
    currency: "COP",
  });
  sinkReference = codeA;
  sinkTxId = `tx-${STAMP}-a`;
  txStatus = "APPROVED";
  txAmount = total;

  const before = requests;
  const statusA = await confirmOrderWithWompi(codeA);
  assert("A: se consultó la API de Wompi (la app usa el sink local)", requests > before);
  assert(`A: la orden pasa a approved (dio ${statusA})`, statusA === "approved");
  assert("A: el estado quedó persistido como approved", (await statusOf(codeA)) === "approved");

  const grants = await db
    .select({ id: schema.purchases.id })
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, userId));
  assert("A: se entregó el acceso (compra activa creada)", grants.length > 0);

  /* --- Caso B: consulta directa por gatewayReference --------------------- */
  const codeB = `FS-VER${STAMP}-B`;
  sinkTxId = `tx-${STAMP}-b`;
  await createOrder({ code: codeB, total, gatewayReference: sinkTxId });
  sinkReference = codeB;
  const statusB = await confirmOrderWithWompi(codeB);
  assert(`B: con id de transacción también aprueba (dio ${statusB})`, statusB === "approved");

  /* --- Caso C: la transacción sigue PENDING ------------------------------ */
  const codeC = `FS-VER${STAMP}-C`;
  await createOrder({ code: codeC, total });
  sinkReference = codeC;
  txStatus = "PENDING";
  const statusC = await confirmOrderWithWompi(codeC);
  assert(`C: si Wompi aún no aprobó, la orden sigue pending (dio ${statusC})`, statusC === "pending");

  /* --- Caso D: monto distinto no debe aprobar ---------------------------- */
  const codeD = `FS-VER${STAMP}-D`;
  sinkTxId = `tx-${STAMP}-d`;
  await createOrder({ code: codeD, total, gatewayReference: sinkTxId });
  sinkReference = codeD;
  txStatus = "APPROVED";
  txAmount = total + 1;
  const statusD = await confirmOrderWithWompi(codeD);
  assert(`D: un monto que no cuadra NO aprueba (dio ${statusD})`, statusD === "pending");

  /* --- Caso E: Wompi caído no aprueba ni lanza --------------------------- */
  const codeE = `FS-VER${STAMP}-E`;
  sinkTxId = `tx-${STAMP}-e`;
  await createOrder({ code: codeE, total, gatewayReference: sinkTxId });
  sinkReference = codeE;
  txStatus = "APPROVED";
  txAmount = total;
  failMode = true;
  const statusE = await confirmOrderWithWompi(codeE).catch(() => "excepcion");
  failMode = false;
  assert(
    `E: si la API de Wompi falla, la orden queda pending y sin excepción (dio ${statusE})`,
    statusE === "pending",
  );

  /* --- Caso F: id que Wompi añade al redirect (`?id=…`) ------------------ */
  // El comprador vuelve con ese id y la orden todavía no tiene
  // gatewayReference (el webhook no ha llegado). Es la vía rápida real: sin
  // ella solo quedaba el listado, que con la llave pública responde 401.
  const codeF = `FS-VER${STAMP}-F`;
  sinkTxId = `tx-${STAMP}-f`;
  await createOrder({ code: codeF, total });
  sinkReference = codeF;
  txStatus = "APPROVED";
  txAmount = total;
  const statusF = await confirmOrderWithWompi(codeF, sinkTxId);
  assert(`F: el id del redirect confirma la orden (dio ${statusF})`, statusF === "approved");

  /* --- Caso G: id ajeno (reference distinta) NO debe aprobar ------------- */
  // El id llega por la URL, así que es dato del cliente: solo vale si la
  // transacción apunta a ESTA orden.
  const codeG = `FS-VER${STAMP}-G`;
  sinkTxId = `tx-${STAMP}-g`;
  await createOrder({ code: codeG, total });
  sinkReference = `FS-OTRA-${STAMP}`;
  txStatus = "APPROVED";
  txAmount = total;
  const statusG = await confirmOrderWithWompi(codeG, sinkTxId);
  assert(
    `G: un id cuya reference no es la orden NO aprueba (dio ${statusG})`,
    statusG === "pending",
  );

  /* --- Caso H: rechazo reflejado en la tienda ----------------------------- */
  const codeH = `FS-VER${STAMP}-H`;
  sinkTxId = `tx-${STAMP}-h`;
  await createOrder({ code: codeH, total });
  sinkReference = codeH;
  txStatus = "DECLINED";
  txAmount = total;
  const statusH = await confirmOrderWithWompi(codeH, sinkTxId);
  assert(
    `H: un DECLINED se confirma a demanda (dio ${statusH})`,
    statusH === "declined",
  );
  assert("H: el rechazo queda persistido en la orden", (await statusOf(codeH)) === "declined");

  /* --- Caso I: un APPROVED posterior SÍ recupera una orden rechazada ----- */
  // El comprador falló con una tarjeta y luego pagó con otra: son dos
  // transacciones sobre la misma orden. Si el rechazo la sellara, el pago
  // real quedaría bloqueado con el dinero cobrado.
  sinkTxId = `tx-${STAMP}-i`;
  txStatus = "APPROVED";
  const statusI = await confirmOrderWithWompi(codeH, sinkTxId);
  assert(
    `I: tras el rechazo, un pago aprobado SÍ aprueba (dio ${statusI})`,
    statusI === "approved",
  );
  assert("I: la orden quedó aprobada en la base", (await statusOf(codeH)) === "approved");

  /* --- Caso J: rechazo de otra referencia no toca la orden ---------------- */
  const codeJ = `FS-VER${STAMP}-J`;
  sinkTxId = `tx-${STAMP}-j`;
  await createOrder({ code: codeJ, total });
  sinkReference = `FS-OTRA-${STAMP}`;
  txStatus = "DECLINED";
  const statusJ = await confirmOrderWithWompi(codeJ, sinkTxId);
  assert(
    `J: un rechazo ajeno NO marca la orden (dio ${statusJ})`,
    statusJ === "pending",
  );

  /* --- Caso K: UN solo viaje de red por sondeo --------------------------- */
  // Antes, si el id existía pero la consulta fallaba, se encadenaba además el
  // listado: DOS viajes de red por sondeo en el camino caliente del comprador.
  const codeK = `FS-VER${STAMP}-K`;
  sinkTxId = `tx-${STAMP}-k`;
  await createOrder({ code: codeK, total });
  sinkReference = codeK;
  txStatus = "PENDING";
  const requestsBeforeK = requests;
  await confirmOrderWithWompi(codeK, sinkTxId);
  assert(
    `K: con id se hace UNA sola llamada a Wompi (fueron ${requests - requestsBeforeK})`,
    requests - requestsBeforeK === 1,
  );

  /* --- Caso L: sin id y con el listado rechazado (401 real) --------------- */
  // Es la situación de producción con solo la llave pública: no hay id porque
  // el redirect no lo trajo, y el listado no está permitido. Debe devolver el
  // estado de la base sin reventar ni aprobar nada.
  const codeL = `FS-VER${STAMP}-L`;
  await createOrder({ code: codeL, total });
  sinkReference = codeL;
  txStatus = "APPROVED";
  listUnauthorized = true;
  const statusL = await confirmOrderWithWompi(codeL).catch(() => "excepcion");
  listUnauthorized = false;
  assert(
    `L: sin id y con listado 401 la orden sigue pending sin reventar (dio ${statusL})`,
    statusL === "pending",
  );
}

// Sin top-level await: `tsx` emite este script como CJS.
main()
  .catch((error: unknown) => {
    console.error("Error inesperado:", error instanceof Error ? error.message : error);
    failures += 1;
  })
  .finally(async () => {
    // Cerrar el sink esperando el callback: salir con un handle a medio cerrar
    // revienta libuv en Windows (assert UV_HANDLE_CLOSING) y el script termina
    // con exit 127 aunque todas las aserciones hayan pasado.
    await new Promise<void>((resolve) => sink.close(() => resolve()));
    try {
      await cleanup();
      const leftover = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(inArray(schema.orders.id, orderIds));
      console.log(
        `\nLimpieza: ${leftover.length} órdenes de prueba restantes (peticiones al sink: ${requests}).`,
      );
    } catch (error) {
      console.error("Fallo al limpiar:", error instanceof Error ? error.message : error);
      failures += 1;
    }
    console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FALLO(S)`);
    // Sin `process.exit()`: en Windows, salir con el cliente de Postgres y el
    // sink aún vivos revienta libuv (assert UV_HANDLE_CLOSING) y el script
    // termina en 127 aunque todo haya pasado. Se cierra todo y se deja que el
    // proceso acabe solo, con el código de salida puesto a mano.
    process.exitCode = failures === 0 ? 0 : 1;
    try {
      await db.$client.end();
    } catch {
      // El cliente puede estar ya cerrado.
    }
  });
