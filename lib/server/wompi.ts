import { createHash } from "node:crypto";

import { loadWompiSettings } from "@/lib/server/wompi-settings";
import { serverEnv } from "@/lib/serverEnv";

export type WompiConfig = {
  configured: boolean;
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
  /** Entorno DECLARADO por el admin (selector del panel / WOMPI_ENV). */
  env: "sandbox" | "production";
  /** Entorno que IMPLICA el prefijo de `publicKey`. `null` si no es reconocible. */
  keyEnv: "sandbox" | "production" | null;
  /** Entorno que IMPLICA el prefijo del integrity secret. `null` si no se reconoce. */
  integrityEnv: "sandbox" | "production" | null;
  /** Entorno que IMPLICA el prefijo del events secret. `null` si no se reconoce. */
  eventsEnv: "sandbox" | "production" | null;
  /** La llave contradice el entorno declarado. */
  envMismatch: boolean;
  apiUrl: string;
  checkoutUrl: string;
};

/**
 * Entorno que implica una llave pública de Wompi por su prefijo.
 *
 * En Wompi el sandbox y la producción comparten el MISMO checkout
 * (`checkout.wompi.co/p/`): lo que decide si se cobra dinero real es la llave
 * (`pub_test_` → pruebas, `pub_prod_` → producción), no el selector de entorno
 * ni el panel de Wompi. Por eso hay que derivar el entorno de la llave y no
 * fiarse solo de lo que el admin eligió.
 */
export function wompiKeyEnvironment(publicKey: string): "sandbox" | "production" | null {
  const key = publicKey.trim().toLowerCase();
  if (key.startsWith("pub_test")) return "sandbox";
  if (key.startsWith("pub_prod")) return "production";
  return null;
}

/**
 * Entorno que implica un SECRETO de Wompi (integridad o eventos) por su
 * prefijo: `test_…` → pruebas, `prod_…` → producción. Wompi lo advierte en su
 * documentación: las credenciales NO se mezclan entre ambientes. Una llave
 * `pub_test_` con un integrity secret `prod_…` produce una firma que la
 * pasarela rechaza, así que conviene detectarlo antes de abrir el checkout.
 * `null` si el prefijo no es reconocible (no se asume nada).
 */
export function wompiSecretEnvironment(secret: string): "sandbox" | "production" | null {
  const s = secret.trim().toLowerCase();
  if (s.startsWith("test_")) return "sandbox";
  if (s.startsWith("prod_")) return "production";
  return null;
}

/**
 * Motivo por el que NO se debe lanzar el checkout, o `null` si la config está
 * coherente. Se extrae como función pura para poder verificar la regla sin
 * tocar la pasarela.
 *
 * Sin este guard, una llave `pub_prod_` guardada con el panel en «sandbox» cobra
 * dinero REAL a quien creía estar probando — exactamente el incidente que este
 * chequeo previene.
 */
export function wompiCheckoutBlockReason(
  config: Pick<
    WompiConfig,
    "configured" | "env" | "keyEnv" | "integrityEnv" | "envMismatch"
  >,
): string | null {
  const envLabel = (e: "sandbox" | "production") => (e === "production" ? "producción" : "pruebas");

  // 1) La llave contradice el entorno declarado. Caso peligroso: el panel dice
  //    "sandbox" pero la llave es de producción → cobra dinero real.
  if (config.configured && config.envMismatch && config.keyEnv) {
    const consequence =
      config.keyEnv === "production"
        ? "Se bloqueó el pago para no cobrar dinero real creyendo que era una prueba."
        : "Se bloqueó el pago porque un cobro real sería rechazado por la pasarela.";
    const prefix = config.keyEnv === "production" ? "pub_prod_" : "pub_test_";
    return (
      `La llave pública de Wompi es de ${envLabel(config.keyEnv)} (${prefix}) pero el entorno configurado es ` +
      `${envLabel(config.env)}. ${consequence} Corrige las credenciales en Administración → Ajustes → Wompi.`
    );
  }

  // 2) La llave y el integrity secret son de entornos distintos: la firma que
  //    se calcula aquí no validaría en Wompi y el checkout fallaría igual.
  if (config.configured && config.keyEnv && config.integrityEnv && config.integrityEnv !== config.keyEnv) {
    return (
      `La llave pública es de ${envLabel(config.keyEnv)} pero el secreto de integridad es de ` +
      `${envLabel(config.integrityEnv)}. Wompi rechazaría la firma del checkout. ` +
      "Usa las tres credenciales del mismo entorno (llave, integridad y eventos) en Administración → Ajustes → Wompi."
    );
  }

  return null;
}

export async function getWompiConfig(): Promise<WompiConfig> {
  const stored = await loadWompiSettings();
  const declaredEnv = stored.env;
  const publicKey = stored.publicKey;
  const integritySecret = stored.integritySecret;
  const eventsSecret = stored.eventsSecret;
  // El prefijo de la llave manda sobre el entorno declarado: es lo que Wompi
  // usa de verdad para decidir si el cobro es real. Si la llave es reconocible,
  // la API de transacciones se apunta a su entorno (leer con la llave
  // equivocada devolvía vacío y la reconciliación no confirmaba nada).
  const keyEnv = wompiKeyEnvironment(publicKey);
  const integrityEnv = wompiSecretEnvironment(integritySecret);
  const eventsEnv = wompiSecretEnvironment(eventsSecret);
  const effectiveEnv = keyEnv ?? integrityEnv ?? declaredEnv;
  const envMismatch = keyEnv !== null && keyEnv !== declaredEnv;
  const apiUrl =
    serverEnv.wompiApiUrl ||
    (effectiveEnv === "production" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1");
  const checkoutUrl = "https://checkout.wompi.co/p/";
  return {
    configured: !!(publicKey && integritySecret && eventsSecret),
    publicKey,
    integritySecret,
    eventsSecret,
    env: declaredEnv,
    keyEnv,
    integrityEnv,
    eventsEnv,
    envMismatch,
    apiUrl,
    checkoutUrl,
  };
}

/**
 * Firmas de integridad. Según la documentación de Wompi (Widget & Checkout Web,
 * Colombia) la firma es un SHA-256 del texto concatenado, en este orden:
 *   <Referencia><MontoEnCentavos><Moneda>[<Expiración>]<SecretoDeIntegridad>
 */
export function generateIntegritySignature(
  input: {
    reference: string;
    amountInCents: number;
    currency: string;
    expirationTime?: string;
  },
  integritySecret: string = serverEnv.wompiIntegritySecret,
): string {
  const { reference, amountInCents, currency, expirationTime } = input;
  const text = `${reference}${amountInCents}${currency}${expirationTime ?? ""}${integritySecret}`;
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export type WompiCheckoutField = {
  name: string;
  value: string;
};

/** Campos del Web Checkout hospedado en Wompi (form POST a checkoutUrl). */
export function buildWompiCheckoutFields(input: {
  publicKey: string;
  integritySecret: string;
  reference: string;
  amountInCents: number;
  currency: string;
  customerFullName?: string;
  customerEmail?: string;
  customerPhoneNumber?: string;
  customerPhonePrefix?: string;
  redirectUrl?: string;
}): WompiCheckoutField[] {
  const {
    publicKey,
    integritySecret,
    reference,
    amountInCents,
    currency,
    customerFullName,
    customerEmail,
    customerPhoneNumber,
    customerPhonePrefix,
    redirectUrl,
  } = input;
  const signature = generateIntegritySignature({ reference, amountInCents, currency }, integritySecret);

  const fields: WompiCheckoutField[] = [
    { name: "public-key", value: publicKey },
    { name: "currency", value: currency },
    { name: "amount-in-cents", value: String(amountInCents) },
    { name: "reference", value: reference },
    { name: "signature:integrity", value: signature },
  ];
  if (redirectUrl) fields.push({ name: "redirect-url", value: redirectUrl });
  if (customerEmail) fields.push({ name: "customer-data:email", value: customerEmail });
  if (customerFullName) fields.push({ name: "customer-data:full-name", value: customerFullName });
  if (customerPhoneNumber) fields.push({ name: "customer-data:phone-number", value: customerPhoneNumber });
  if (customerPhonePrefix) fields.push({ name: "customer-data:phone-number-prefix", value: customerPhonePrefix });
  return fields;
}

export type WompiEventPayload = {
  event?: string;
  data?: Record<string, unknown>;
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
  [key: string]: unknown;
};

/* ---------------------------------------------------------------------------
 * Lectura de transacciones (reconciliación).
 *
 * Se usa la PUBLIC key, que en Wompi da permiso de lectura de transacciones del
 * comercio. Estas funciones NUNCA aprueban nada por sí solas: devuelven datos
 * crudos y quien decide es `approveOrderFromTransaction`. Ante cualquier error
 * devuelven null / lista vacía para que un fallo de la pasarela no pueda
 * provocar aprobaciones masivas ni tirones de la app.
 * ------------------------------------------------------------------------- */

export type WompiTransactionResponse = {
  id: string;
  reference?: string;
  status?: string;
  amount_in_cents?: number;
  currency?: string;
  created_at?: string;
  [key: string]: unknown;
};

async function wompiGet(config: WompiConfig, path: string): Promise<unknown> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${config.publicKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Wompi ${path} respondió ${res.status}`);
  return res.json();
}

/** Consulta una transacción por id. `null` si no existe o si la API falla. */
export async function fetchWompiTransaction(
  config: WompiConfig,
  transactionId: string,
): Promise<WompiTransactionResponse | null> {
  try {
    const body = (await wompiGet(config, `/transactions/${encodeURIComponent(transactionId)}`)) as {
      data?: WompiTransactionResponse;
    };
    return body?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Transacciones aprobadas/creadas en una ventana temporal, para emparejar
 * payments cuyo webhook nunca llegó (servidor caído, deploy, reintentos
 * agotados). Wompi acota la ventana; se pide solo lo necesario.
 */
export async function fetchWompiTransactionsSince(
  config: WompiConfig,
  since: Date,
): Promise<WompiTransactionResponse[]> {
  const from = Math.floor(since.getTime() / 1000);
  const to = Math.floor(Date.now() / 1000);
  try {
    const body = (await wompiGet(config, `/transactions?from=${from}&to=${to}`)) as {
      data?: WompiTransactionResponse[];
    };
    return Array.isArray(body?.data) ? body.data : [];
  } catch {
    return [];
  }
}

function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (
      acc &&
      typeof acc === "object" &&
      key in (acc as Record<string, unknown>)
    ) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Verifica la firma de un EVENTO de Wompi (webhook). Es un checksum SHA-256 de
 * la concatenación (por orden) de los valores de `signature.properties`, luego
 * el `timestamp` del evento y por último el events secret. El valor viaja en
 * `signature.checksum` del body o en el header `x-event-checksum`.
 * (The integrity signature del checkout es OTRA firma: `generateIntegritySignature`.)
 */
export function verifyWompiEventChecksum(
  payload: WompiEventPayload,
  eventsSecret: string,
  checksumOverride?: string,
): boolean {
  const { properties, checksum } = payload.signature ?? {};

  if (!Array.isArray(properties) || properties.length === 0) return false;

  const candidate = checksumOverride ?? checksum;
  if (!candidate) return false;

  if (checksum && checksumOverride && checksum.toLowerCase() !== checksumOverride.toLowerCase()) {
    return false;
  }

  const raw =
    properties
      .map((path) => {
        const fieldValue = resolvePath(payload.data, path);
        return fieldValue == null ? "" : String(fieldValue);
      })
      .join("") + String(payload.timestamp ?? "") + eventsSecret;
  const expected = createHash("sha256").update(raw, "utf8").digest("hex");
  return expected.toLowerCase() === candidate.toLowerCase();
}