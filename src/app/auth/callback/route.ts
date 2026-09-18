import { createClient } from "@/lib/supabase/server";
import { checkMembership } from "@/lib/membership";
import { logAuthEvent } from "@/lib/auth-events";
import { maskEmail } from "@/lib/utils";
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
  const email = data.user?.email;
  const userId = data.user?.id;
  const provider = data.user?.app_metadata?.provider ?? "google";

  if (error) return fail(error.message, email);

  const membership = await checkMembership(email);

  if (membership.ok) {
    await logAuthEvent({ event: "login_ok", email, userId, provider, request });
    return NextResponse.redirect(`${origin}/chat`);
  }

  // No pudimos comprobar (Supabase caído/pausado). NO es un "no": decirle a un
  // miembro legítimo que su membresía venció por un blip de infra es el falso
  // positivo más caro que puede dar este flujo. Se le pide reintentar y se
  // descarta la sesión, sin afirmar nada sobre su membresía.
  if (membership.kind === "check_failed") {
    await logAuthEvent({
      event: "callback_error",
      email,
      userId,
      provider,
      reason: `check_failed: ${membership.error}`,
      request,
    });
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${origin}/login?error=temporary`);
  }

  // Rechazo real. Scope local: solo hay que descartar la sesión que se acaba de
  // crear. Si además la persona está revocada y tiene sesiones vivas en otros
  // dispositivos, el gate del proxy las corta con scope global — no hace falta
  // que un intento de login desde un navegador tumbe los demás.
  await supabase.auth.signOut({ scope: "local" });

  if (membership.kind === "email_mismatch") {
    await logAuthEvent({
      event: "login_rejected_email_mismatch",
      email,
      userId,
      provider,
      reason: `membresía a nombre de ${membership.memberEmail}`,
      request,
    });
    const params = new URLSearchParams({
      reason: "email_mismatch",
      used: maskEmail(email!),
      member: maskEmail(membership.memberEmail),
    });
    return NextResponse.redirect(`${origin}/unauthorized?${params}`);
  }

  await logAuthEvent({
    event: membership.kind === "revoked" ? "login_rejected_revoked" : "login_rejected_not_member",
    email,
    userId,
    provider,
    request,
  });
  const reason = membership.kind === "revoked" ? "revoked" : "never_member";
  return NextResponse.redirect(`${origin}/unauthorized?reason=${reason}`);
}
