/**
 * Valida un `?next=` / `callbackURL` de redirección post-login: solo rutas
 * relativas del mismo origen. Rechaza `//host`, backslash y cualquier valor
 * absoluto (evita open redirect). Devuelve `null` si no es seguro.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}