import { createHash, timingSafeEqual } from "crypto";

// Compara en tiempo constante hasheando ambos valores primero: evita tanto el
// leak de timing por longitud (timingSafeEqual falla si los buffers difieren
// en tamaño) como por contenido.
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Autentica un webhook de Skool contra SKOOL_WEBHOOK_SECRET.
 *
 * Solo cabecera. Antes también se aceptaba `?secret=` en la URL, y eso escribía
 * el secreto en claro en los access logs de Vercel y en cualquier traza de
 * error: toda la molestia de comparar en tiempo constante, deshecha por dejarlo
 * persistido en texto plano. Zapier ya manda la cabecera, así que quitar el
 * parámetro no rompe la integración en uso.
 */
export function authorizeWebhook(request: Request): boolean {
  const secret = request.headers.get("x-webhook-secret") || "";
  const expected = process.env.SKOOL_WEBHOOK_SECRET;
  return Boolean(expected && secret && secretsMatch(secret, expected));
}
