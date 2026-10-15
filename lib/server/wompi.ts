import { createHash, timingSafeEqual } from "node:crypto";

import { loadWompiSettings } from "@/lib/server/wompi-settings";
import { serverEnv } from "@/lib/serverEnv";

export type WompiConfig = {
  configured: boolean;
  publicKey: string;
  /** Llave PRIVADA de comercio (`prv_…`). Opcional. No se usa en el checkout ni
   *  se expone al navegador: solo autentica lecturas server-to-server (listado
   *  de transacciones en la reconciliación). */
  privateKey: string;
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
 * Entorno que implica la LLAVE PRIVADA de Wompi por su prefijo:
 * `prv_test_…` → pruebas, `prv_prod_…` → producción. Igual que las demás
 * credenciales, no se mezcla entre ambientes. `null` si no se reconoce.
 */
export function wompiPrivateKeyEnvironment(privateKey: string): "sandbox" | "production" | null {
  const k = privateKey.trim().toLowerCase();
  if (k.startsWith("prv_test")) return "sandbox";
  if (k.startsWith("prv_prod")) return "production";
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
    "configured" | "env" | "keyEnv" | "integrityEnv" | "eventsEnv" | "envMismatch"
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

  // 3) El events secret es de otro entorno: el checkout se abriría, pero el
  //    webhook no podría verificar NINGUNA confirmación y las compras quedarían
  //    pendientes para siempre. Mejor bloquear antes de cobrar.
  if (config.configured && config.keyEnv && config.eventsEnv && config.eventsEnv !== config.keyEnv) {
    return (
      `La llave pública es de ${envLabel(config.keyEnv)} pero el secreto de eventos es de ` +
      `${envLabel(config.eventsEnv)}. No se podrían verificar los webhooks y las compras quedarían sin confirmar. ` +
      "Usa las tres credenciales del mismo entorno (llave, integridad y eventos) en Administración → Ajustes → Wompi."
    );
  }

  return null;
}

/**
 * Normaliza una credencial pegada a mano. Copiar del panel de Wompi suele
 * arrastrar un espacio o un salto de línea al final del valor; como el secreto
 * entra TAL CUAL en el hash (no es un separador, es parte de la cadena), un
 * carácter invisible cambia la firma y la pasarela responde
 * «signature: La firma es inválida». Se recorta en la frontera para que el
 * hash use siempre el valor limpio.
 */
export function normalizeWompiSecret(secret: string): string {
  return secret.trim();
}

/**
 * Diagnóstico de credenciales mal pegadas: las causas típicas de
 * «signature: La firma es inválida» son pegar la llave PRIVADA (`prv_…`) en el
 * campo del secreto, reutilizar el mismo valor para integridad y eventos, o
 * arrastrar espacios internos. Devuelve avisos legibles; lista vacía si todo
 * parece sano. Es puro para poder probarlo sin tocar Wompi.
 */
export function wompiSecretWarnings(input: {
  integritySecret: string;
  eventsSecret: string;
}): string[] {
  const warnings: string[] = [];
  const { integritySecret, eventsSecret } = input;
  const fields: Array<[string, string]> = [
    ["integridad", integritySecret],
    ["eventos", eventsSecret],
  ];
  for (const [label, secret] of fields) {
    if (!secret) continue;
    if (secret.trimStart().toLowerCase().startsWith("prv_")) {
      warnings.push(
        `El secreto de ${label} parece la LLAVE PRIVADA (prv_…). Wompi firma con el secreto de ${label}, no con la llave privada.`,
      );
    }
    if (/\s/.test(secret)) {
      warnings.push(`El secreto de ${label} contiene espacios o saltos de línea.`);
    }
  }
  if (integritySecret && eventsSecret && integritySecret.trim() === eventsSecret.trim()) {
    warnings.push(
      "El secreto de integridad y el de eventos tienen el MISMO valor: en Wompi cada uno es distinto.",
    );
  }
  return warnings;
}

export async function getWompiConfig(): Promise<WompiConfig> {
  const stored = await loadWompiSettings();
  const declaredEnv = stored.env;
  // El recorte se hace aquí, en la frontera de la configuración, para que TODO
  // lo que derive de estas credenciales (detección de entorno, hash de firma,
  // lectura de transacciones) trabaje con el valor limpio.
  const publicKey = normalizeWompiSecret(stored.publicKey);
  const privateKey = normalizeWompiSecret(stored.privateKey);
  const integritySecret = normalizeWompiSecret(stored.integritySecret);
  const eventsSecret = normalizeWompiSecret(stored.eventsSecret);
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
    privateKey,
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
  const secret = normalizeWompiSecret(integritySecret);
  const text = `${reference}${amountInCents}${currency}${expirationTime ?? ""}${secret}`;
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

async function wompiGet(
  config: WompiConfig,
  path: string,
  opts: { key?: string; timeoutMs?: number } = {},
): Promise<unknown> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${opts.key ?? config.publicKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) throw new Error(`Wompi ${path} respondió ${res.status}`);
  return res.json();
}

/**
 * Consulta una transacción por id. `null` si no existe o si la API falla.
 *
 * `timeoutMs` lo baja quien está en el camino caliente del comprador: el sondeo
 * de estado no puede quedarse colgado el techo de 15 s (se han observado
 * resoluciones DNS de 11 s hacia el dominio de Wompi), porque mientras dura el
 * navegador no tiene respuesta y no programa el siguiente sondeo.
 *
 * Este endpoint SÍ funciona con la llave pública (`GET /transactions/{id}`).
 */
export async function fetchWompiTransaction(
  config: WompiConfig,
  transactionId: string,
  timeoutMs = 15_000,
): Promise<WompiTransactionResponse | null> {
  try {
    const body = (await wompiGet(
      config,
      `/transactions/${encodeURIComponent(transactionId)}`,
      { timeoutMs },
    )) as {
      data?: WompiTransactionResponse;
    };
    return body?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Transacciones en una ventana temporal, para emparejar pagos cuyo webhook
 * nunca llegó (servidor caído, deploy, reintentos agotados).
 *
 * OJO con los parámetros: el listado de Wompi exige `from_date`/`until_date` en
 * **ISO-8601** (no epoch) y `page`/`page_size`. Antes se mandaba `from`/`to` con
 * timestamps Unix, y Wompi respondía 422 → la lista salía SIEMPRE vacía y la
 * confirmación a demanda no encontraba nunca el pago.
 *
 * Para el LISTADO se usa la LLAVE PRIVADA si está configurada: es el único
 * camino fiable (con la llave PÚBLICA Wompi responde 401, comprobado contra
 * sandbox). Sin llave privada se intenta con la pública como último recurso,
 * pero entonces las órdenes sin `gatewayReference` no se pueden recuperar.
 */
export async function fetchWompiTransactionsSince(
  config: WompiConfig,
  since: Date,
): Promise<WompiTransactionResponse[]> {
  const params = new URLSearchParams({
    from_date: since.toISOString(),
    until_date: new Date().toISOString(),
    page: "1",
    page_size: "200",
  });
  try {
    const body = (await wompiGet(config, `/transactions?${params.toString()}`, {
      key: config.privateKey || config.publicKey,
    })) as {
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
/**
 * Compara dos cadenas hex en tiempo constante. Comparar checksums con `===`
 * filtra, por el tiempo de respuesta, cuántos caracteres iniciales acertó quien
 * prueba firmas a ciegas. `timingSafeEqual` exige el mismo número de bytes, así
 * que se compara sobre la longitud de la esperada y se descarta un candidato de
 * longitud distinta (un checksum de Wompi siempre tiene 64 caracteres hex).
 */
export function safeChecksumEqual(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected.toLowerCase(), "utf8");
  const b = Buffer.from(candidate.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyWompiEventChecksum(
  payload: WompiEventPayload,
  eventsSecret: string,
  checksumOverride?: string,
): boolean {
  const { properties, checksum } = payload.signature ?? {};

  if (!Array.isArray(properties) || properties.length === 0) return false;

  const candidate = checksumOverride ?? checksum;
  if (!candidate) return false;

  if (checksum && checksumOverride && !safeChecksumEqual(checksum, checksumOverride)) {
    return false;
  }

  const raw =
    properties
      .map((path) => {
        const fieldValue = resolvePath(payload.data, path);
        return fieldValue == null ? "" : String(fieldValue);
      })
      .join("") + String(payload.timestamp ?? "") + normalizeWompiSecret(eventsSecret);
  const expected = createHash("sha256").update(raw, "utf8").digest("hex");
  return safeChecksumEqual(expected, candidate);
}