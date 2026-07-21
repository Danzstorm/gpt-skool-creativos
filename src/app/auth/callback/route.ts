import { createClient } from "@/lib/supabase/server";
import { checkMembership } from "@/lib/membership";
import { logAuthEvent } from "@/lib/auth-events";
import { maskEmail } from "@/lib/utils";
import { NextResponse } from "next/server";

type EmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

// Traduce el mensaje crudo de Supabase a un código que /login sabe explicar.
// El mensaje crudo NO se le muestra al usuario (puede filtrar detalle interno);
// va entero a auth_events.reason, que es donde hace falta para depurar.
function errorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired") || m.includes("invalid") || m.includes("not found")) {
    return "link_expired";
  }
  if (m.includes("code verifier") || m.includes("pkce")) return "link_other_browser";
  return "auth_failed";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Error devuelto directo por Supabase (redirect_to no permitido, link expirado, etc.)
  const providerError = searchParams.get("error_description") || searchParams.get("error");

  // Todo rechazo termina en una URL que EXPLICA el motivo. La versión anterior
  // mandaba a /login?error=... y /login jamás leía ese parámetro, así que el
  // usuario volvía a una pantalla de login muda: un rechazo legítimo y un bug se
  // veían exactamente igual.
  const fail = async (reason: string, email?: string | null) => {
    console.error("[auth/callback] fallo:", reason, {
      hasCode: !!code,
      hasTokenHash: !!tokenHash,
      type,
      providerError,
    });
    await logAuthEvent({
      event: "callback_error",
      email,
      reason,
      provider: code ? "oauth" : "magiclink",
      request,
    });
    return NextResponse.redirect(`${origin}/login?error=${errorCode(reason)}`);
  };

  if (providerError) return fail(providerError);

  const supabase = await createClient();

  // Flujo PKCE (?code=) o flujo OTP/token_hash (?token_hash=&type=), lo que llegue.
  let authError: string | null = null;
  let email: string | null | undefined;
  let userId: string | null | undefined;
  let provider: string | null | undefined;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error?.message ?? null;
    email = data.user?.email;
    userId = data.user?.id;
    provider = data.user?.app_metadata?.provider ?? "oauth";
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    authError = error?.message ?? null;
    email = data.user?.email;
    userId = data.user?.id;
    provider = "magiclink";
  } else {
    return fail("sin_code_ni_token_hash");
  }

  if (authError) return fail(authError, email);

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
