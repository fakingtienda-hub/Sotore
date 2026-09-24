/**
 * Rate limit en memoria (ventana fija), suficiente para un VPS de una sola
 * instancia. Mitiga abuso/DoS en endpoints de descarga; no reemplaza el
 * límite de descargas por archivo (`downloadLimit`).
 *
 * Sin guard `server-only`: es lógica pura (una Map) y los scripts de
 * verificación la ejercitan.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();

  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true };
}