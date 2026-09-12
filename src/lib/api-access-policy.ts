export type ApiAccess = "not-api" | "session-exempt" | "authenticated";

// Excepciones explícitas al default-deny de /api. Añadir una ruta aquí requiere
// decidir y documentar qué la autentica; el resto exige sesión automáticamente.
const SESSION_EXEMPT_API_PATHS = new Set([
  "/api/auth/check-email",
  "/api/auth/signout",
  "/api/webhooks/skool",
  "/api/webhooks/skool/bulk",
]);

export function apiAccessForPath(pathname: string): ApiAccess {
  if (!pathname.startsWith("/api/")) return "not-api";
  const normalizedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (SESSION_EXEMPT_API_PATHS.has(normalizedPath)) return "session-exempt";
  return "authenticated";
}
