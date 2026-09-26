import { createClient } from "@/lib/supabase/server";
import { logAuthEvent } from "@/lib/auth-events";
import { finishLogin } from "@/lib/finish-login";
import { NextResponse } from "next/server";

// Traduce el mensaje crudo de Supabase/Google a un código que /login sabe
// explicar. El mensaje crudo NO se le muestra al usuario (puede filtrar detalle
// interno); va entero a auth_events.reason, que es donde hace falta para depurar.
function errorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("access_denied")) return "cancelled";
  if (m.includes("code verifier") || m.includes("pkce")) return "other_browser";
  return "auth_failed";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Error devuelto directo por Supabase o Google (redirect_to no permitido, la
  // persona canceló en el selector de cuentas, etc.). Se guardan los dos campos:
  // `error` es el código estable, `error_description` el texto para depurar.
  const providerError = [searchParams.get("error"), searchParams.get("error_description")]
    .filter(Boolean)
    .join(": ");

  // Todo rechazo termina en una URL que EXPLICA el motivo. La versión anterior
  // mandaba a /login?error=... y /login jamás leía ese parámetro, así que el
  // usuario volvía a una pantalla de login muda: un rechazo legítimo y un bug se
  // veían exactamente igual.
  const fail = async (reason: string, email?: string | null) => {
    console.error("[auth/callback] fallo:", reason, { hasCode: !!code, providerError });
    await logAuthEvent({ event: "callback_error", email, reason, provider: "google", request });
    return NextResponse.redirect(`${origin}/login?error=${errorCode(reason)}`);
  };

  if (providerError) return fail(providerError);
  if (!code) return fail("sin_code");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  const provider = data.user?.app_metadata?.provider ?? "google";
  const next = await finishLogin({ supabase, user: data.user, provider, request });
  return NextResponse.redirect(`${origin}${next}`);
}
