import { createHash } from "node:crypto";

import { loadWompiSettings } from "@/lib/server/wompi-settings";
import { serverEnv } from "@/lib/serverEnv";

export type WompiConfig = {
  configured: boolean;
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
  env: "sandbox" | "production";
  apiUrl: string;
  checkoutUrl: string;
};

export async function getWompiConfig(): Promise<WompiConfig> {
  const stored = await loadWompiSettings();
  const env = stored.env;
  const publicKey = stored.publicKey;
  const integritySecret = stored.integritySecret;
  const eventsSecret = stored.eventsSecret;
  const apiUrl = serverEnv.wompiApiUrl || (env === "production" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1");
  const checkoutUrl = "https://checkout.wompi.co/p/";
  return {
    configured: !!(publicKey && integritySecret && eventsSecret),
    publicKey,
    integritySecret,
    eventsSecret,
    env,
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
  if (!properties?.length) return false;
  const value = checksumOverride ?? checksum;
  if (!value) return false;
  const raw =
    properties
      .map((path) => {
        const fieldValue = resolvePath(payload.data, path);
        return fieldValue == null ? "" : String(fieldValue);
      })
      .join("") + String(payload.timestamp ?? "") + eventsSecret;
  const expected = createHash("sha256").update(raw, "utf8").digest("hex");
  return expected.toLowerCase() === value.toLowerCase();
}