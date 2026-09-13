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

// Sin Redis el límite es POR INSTANCIA: en serverless, N instancias calientes
// multiplican por N todos los topes, y eso multiplica también el gasto de
// OpenAI que estos límites existen para contener. No se lanza —tirar el arranque
// de producción por esto sería peor que el problema— pero deja de ser invisible.
if (!redis && process.env.NODE_ENV === "production") {
  console.error(
    "rate-limit: UPSTASH_REDIS_REST_URL/TOKEN sin configurar en producción. " +
      "El límite pasa a ser por instancia y deja de ser un tope real."
  );
}

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

// Para no llenar los logs cuando Redis está caído: un aviso por minuto alcanza
// para enterarse, y el resto de los fallos ya quedan representados por ese.
let lastRedisFailureLog = 0;

async function checkUpstash(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    const { success, remaining, reset } = await getLimiter(limit, windowMs).limit(key);
    return {
      ok: success,
      remaining,
      retryAfterSec: success ? 0 : Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (error) {
    // Sin esto, un Redis sin cuota o caído tiraba la petición entera: la llamada
    // vive antes del try/catch de las rutas, así que la excepción llegaba como
    // 500 y el chat dejaba de responder. Un límite que al fallar mata lo que
    // estaba protegiendo es peor que no tenerlo.
    //
    // Se cae al contador en memoria, que es exactamente lo que había antes de
    // conectar Redis: sigue limitando, solo que por instancia. Degradar a una
    // protección más débil es preferible a quedarse sin aplicación, y también a
    // dejar pasar todo sin tope.
    const now = Date.now();
    if (now - lastRedisFailureLog > 60_000) {
      lastRedisFailureLog = now;
      console.error(
        "rate-limit: Redis no respondió, se usa el contador en memoria (tope por instancia). " +
          (error instanceof Error ? error.message : String(error))
      );
    }
    return checkInMemory(key, limit, windowMs);
  }
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

/**
 * IP del cliente para las rutas públicas que limitan por IP.
 *
 * `x-forwarded-for` lo escribe el cliente y solo lo sobrescriben los proxies de
 * confianza más cercanos, así que tomar su primer valor —el patrón que había—
 * deja la clave del limitador en manos del atacante: cambiando la cabecera se
 * reinicia el contador en cada petición. `x-vercel-forwarded-for` lo pone la
 * plataforma y no es falsificable desde fuera, así que va primero. El
 * `x-forwarded-for` queda solo como último recurso para desarrollo local.
 */
export function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
