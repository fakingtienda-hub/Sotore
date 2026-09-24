/**
 * Comparación de tokens en tiempo constante (evita timing attacks). Módulo
 * puro y sin `server-only` para poder ejercitarse desde scripts de verificación.
 */
export function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}