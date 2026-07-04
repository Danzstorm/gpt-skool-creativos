// Rate limiter: usa Upstash Redis si está configurado (UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN) — límite compartido entre instancias serverless.
// Si no está configurado, cae a un Map en memoria (ok para dev / una sola
// instancia; en serverless con múltiples instancias el límite sería per-instancia).

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

// --- Fallback en memoria ---

interface Hit {
  count: number;
  resetAt: number;
}

const store = new Map<string, Hit>();

let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hit] of store) {
    if (hit.resetAt <= now) store.delete(key);
  }
}

function checkInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
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

// --- Upstash Redis (opcional) ---

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Un Ratelimit por combinación (limit, windowMs), cacheado para no recrearlo en cada request.
const limiters = new Map<string, Ratelimit>();
function getLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let rl = limiters.get(cacheKey);
  if (!rl) {
    rl = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${Math.max(1, Math.round(windowMs / 1000))} s`),
      analytics: false,
      prefix: "gpt-creativos:ratelimit",
    });
    limiters.set(cacheKey, rl);
  }
  return rl;
}

async function checkUpstash(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const { success, remaining, reset } = await getLimiter(limit, windowMs).limit(key);
  return {
    ok: success,
    remaining,
    retryAfterSec: success ? 0 : Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
  };
}

/**
 * @param key      identificador único (p.ej. `chat:${userId}`)
 * @param limit    máximo de requests permitidos en la ventana
 * @param windowMs tamaño de la ventana en ms
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (redis) return checkUpstash(key, limit, windowMs);
  return checkInMemory(key, limit, windowMs);
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
