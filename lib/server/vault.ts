import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { serverEnv } from "@/lib/serverEnv";

/**
 * Cifrado de secretos en reposo (AES-256-GCM). La llave de cifrado se deriva
 * de AUTH_SECRET vía HKDF, de modo que jamás viaja por red ni a la BD: quien
 * obtenga una copia de la BD no puede leer los secretos sin AUTH_SECRET.
 *
 * Formato almacenado: `v1:<iv>.<tag>.<ciphertext>` (base64url).
 */

const HKDF_SALT = Buffer.from("fakingstore:wompi-vault:v1", "utf8");
const HKDF_INFO = Buffer.from("wompi-keys", "utf8");

function deriveVaultKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(serverEnv.authSecret, "utf8"), HKDF_SALT, HKDF_INFO, 32));
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveVaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** Devuelve el secreto o null si no hay / no se puede descifrar (AUTH_SECRET distinto). */
export function decryptSecret(payload: string): string | null {
  if (!payload) return null;
  try {
    const [version, rest] = payload.split(":");
    if (version !== "v1" || !rest) return null;
    const [ivB64, tagB64, ctB64] = rest.split(".");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveVaultKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}