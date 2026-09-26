import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkMembership, normalizeEmail } from "@/lib/membership";
import { logAuthEvent } from "@/lib/auth-events";

// Envía el código de acceso por correo (alternativa a Google).
//
// Por qué un código y no un enlace: el enlace mágico solo funcionaba en el mismo
// navegador donde se pidió (PKCE) y los antivirus de correo lo abrían antes que la
// persona, dejándolo vencido. El código se escribe en la misma pantalla.
//
// Solo se envía a miembros activos: así nadie gasta el cupo de correos de
// Supabase (compartido por todo el proyecto) mandando códigos a cualquiera. La
// respuesta es la misma para miembros y no miembros para no revelar quién está
// en la comunidad.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const membership = await checkMembership(email);
  if (!membership.ok && membership.kind === "check_failed") {
    return NextResponse.json({ error: "temporary" }, { status: 503 });
  }

  if (membership.ok) {
    const supabase = await createClient();
    // shouldCreateUser: quien nunca entró todavía no tiene usuario en Auth.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      await logAuthEvent({ event: "callback_error", email, provider: "email", reason: `email_code: ${error.message}`, request });
      if (error.status === 429) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true });
}
