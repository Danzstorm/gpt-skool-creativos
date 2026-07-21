import { createClient } from "@supabase/supabase-js";

// Cada camino que abre o cierra una sesión escribe acá. Sin esto, un miembro
// expulsado es indistinguible de un bug: ambos terminan de vuelta en /login.
export type AuthEvent =
  | "login_ok"
  | "login_rejected_not_member"
  | "login_rejected_revoked"
  | "login_rejected_email_mismatch"
  | "callback_error"
  | "signout_user"
  | "signout_gate_revoked"
  | "session_expired";

type LogInput = {
  event: AuthEvent;
  email?: string | null;
  userId?: string | null;
  provider?: string | null;
  reason?: string | null;
  request?: Request;
};

// Una de cada N llamadas aprovecha el viaje para purgar lo viejo. Guarda emails
// e IPs: retenerlos para siempre es un pasivo, y un cron aparte sería otra pieza
// que mantener por cliente. A ~cientos de logins/día la purga corre sola varias
// veces por semana.
const RETENTION_DAYS = 90;
const PURGE_SAMPLE_RATE = 100;

// Cliente propio en vez de `@/lib/supabase/server`: ese módulo importa
// `next/headers`, que no existe en el runtime del proxy — y el proxy es
// justamente quien registra los cierres de sesión por revocación.
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Registra un evento de sesión. Nunca lanza: una auditoría rota no puede
 * tumbar un login.
 *
 * Se AWAITEA en el llamador (no es fire-and-forget) por el mismo motivo
 * documentado en api/webhooks/skool/route.ts: sin await, el runtime serverless
 * congela la función al responder y el insert se pierde de forma intermitente.
 * Justo los eventos raros —los que hay que depurar— serían los que se pierdan.
 */
export async function logAuthEvent(input: LogInput): Promise<void> {
  try {
    const service = serviceClient();

    const headers = input.request?.headers;
    const ip =
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers?.get("x-real-ip") ||
      null;

    await service.from("auth_events").insert({
      event: input.event,
      email: input.email?.toLowerCase().trim() || null,
      user_id: input.userId ?? null,
      provider: input.provider ?? null,
      reason: input.reason ?? null,
      ip,
      // Truncado: los UA reales llegan a ~500 chars y no aporta nada guardarlos
      // enteros; alcanza para distinguir móvil de escritorio y navegador.
      user_agent: headers?.get("user-agent")?.slice(0, 200) ?? null,
    });

    if (Math.floor(Math.random() * PURGE_SAMPLE_RATE) === 0) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
      await service.from("auth_events").delete().lt("created_at", cutoff);
    }
  } catch (err) {
    console.error("logAuthEvent: fallo al auditar", err);
  }
}
