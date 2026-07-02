import { createClient } from "@/lib/supabase/server";
import { isAllowedMember } from "@/lib/membership";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Gate real (cubre magic link Y Google OAuth): solo miembros en la lista.
      const email = data.user?.email;
      if (await isAllowedMember(email)) {
        return NextResponse.redirect(`${origin}/chat`);
      }
      // Autenticado pero no está en la comunidad: cerrar sesión y bloquear.
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/unauthorized`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
