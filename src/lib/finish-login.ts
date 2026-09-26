import type { SupabaseClient, User } from "@supabase/supabase-js";
import { checkMembership } from "@/lib/membership";
import { logAuthEvent } from "@/lib/auth-events";
import { maskEmail } from "@/lib/utils";

/**
 * Paso común a todo login (Google o código por correo) una vez que Supabase ya
 * creó la sesión: aplica el gate de membresía, registra el evento y devuelve la
 * ruta a la que hay que mandar a la persona. Si no pasa el gate, descarta la
 * sesión recién creada.
 */
export async function finishLogin({
  supabase,
  user,
  provider,
  request,
}: {
  supabase: SupabaseClient;
  user: User | null | undefined;
  provider: string;
  request: Request;
}): Promise<string> {
  const email = user?.email;
  const userId = user?.id;
  const membership = await checkMembership(email);

  if (membership.ok) {
    await logAuthEvent({ event: "login_ok", email, userId, provider, request });
    return "/chat";
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
    return "/login?error=temporary";
  }

  // Rechazo real. Scope local: solo hay que descartar la sesión que se acaba de
  // crear. Si además la persona está revocada y tiene sesiones vivas en otros
  // dispositivos, el gate del proxy las corta con scope global.
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
    return `/unauthorized?${params}`;
  }

  await logAuthEvent({
    event: membership.kind === "revoked" ? "login_rejected_revoked" : "login_rejected_not_member",
    email,
    userId,
    provider,
    request,
  });
  return `/unauthorized?reason=${membership.kind === "revoked" ? "revoked" : "never_member"}`;
}
