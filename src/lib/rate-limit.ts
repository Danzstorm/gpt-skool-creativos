// Rate limiter simple en memoria (sliding window por usuario+ruta).
//
// NOTA IMPORTANTE: esto vive en el proceso Node. Funciona en un solo servidor
// (dev / instancia única). En Vercel serverless cada invocación puede ser una
// instancia distinta, así que el límite se vuelve por-instancia y no global.
// ANTES DE DEPLOY REAL con tráfico: migrar a @upstash/ratelimit + Upstash Redis
// (misma interfaz `checkRateLimit`), para un límite compartido y persistente.

interface Hit {
  count: number;
  resetAt: number;
}

const store = new Map<string, Hit>();

// Limpieza perezosa: cada tanto purga entradas expiradas para no crecer sin fin.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hit] of store) {
    if (hit.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * @param key      identificador único (p.ej. `chat:${userId}`)
 * @param limit    máximo de requests permitidos en la ventana
 * @param windowMs tamaño de la ventana en ms
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const hit = store.get(key);

  if (!hit || hit.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (hit.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((hit.resetAt - now) / 1000) };
  }

  hit.count += 1;
  return { ok: true, remaining: limit - hit.count, retryAfterSec: 0 };
}

export function rateLimitResponse(result: RateLimitResult) {
  return new Response(
    JSON.stringify({ error: "Demasiadas solicitudes. Espera un momento e intenta de nuevo." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
      },
    }
  );
}
