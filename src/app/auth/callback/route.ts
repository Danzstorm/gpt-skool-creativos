import { createClient } from "@/lib/supabase/server";
import { isAllowedMember } from "@/lib/membership";
import { NextResponse } from "next/server";

type EmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Error devuelto directo por Supabase (redirect_to no permitido, link expirado, etc.)
  const providerError = searchParams.get("error_description") || searchParams.get("error");

  const fail = (reason: string) => {
    console.error("[auth/callback] fallo:", reason, {
      hasCode: !!code,
      hasTokenHash: !!tokenHash,
      type,
      providerError,
    });
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed&reason=${encodeURIComponent(reason)}`
    );
  };

  if (providerError) return fail(providerError);

  const supabase = await createClient();

  // Flujo PKCE (?code=) o flujo OTP/token_hash (?token_hash=&type=), lo que llegue.
  let authError: string | null = null;
  let email: string | null | undefined;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error?.message ?? null;
    email = data.user?.email;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    authError = error?.message ?? null;
    email = data.user?.email;
  } else {
    return fail("sin_code_ni_token_hash");
  }

  if (authError) return fail(authError);

  // Gate real (cubre magic link Y Google OAuth): solo miembros en la lista.
  if (await isAllowedMember(email)) {
    return NextResponse.redirect(`${origin}/chat`);
  }

  // Autenticado pero no está en la comunidad: cerrar sesión y bloquear.
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/unauthorized`);
}
