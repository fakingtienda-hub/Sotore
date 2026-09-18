import { createHash } from "node:crypto";

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

export function getWompiConfig(): WompiConfig {
  const env = (process.env.WOMPI_ENV ?? "sandbox") as WompiConfig["env"];
  const publicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? "";
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET ?? "";
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET ?? "";
  const apiUrl = process.env.WOMPI_API_URL ?? (env === "production" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1");
  const checkoutUrl = "https://checkout.wompi.co/p/";
  return {
    configured: !!(publicKey && integritySecret),
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
  reference: string;
  amountInCents: number;
  currency: string;
  customerFullName?: string;
  customerEmail?: string;
  redirectUrl?: string;
}): WompiCheckoutField[] {
  const { publicKey, reference, amountInCents, currency, customerFullName, customerEmail, redirectUrl } = input;
  const signature = generateIntegritySignature({ reference, amountInCents, currency });

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
  return fields;
}