import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const VALID_THEMES = ["creativo", "dark", "light"] as const;

// Cada usuario puede cambiar SOLO su propio tema. La RLS de `profiles` es
// select-only (ver 20260709010000_profiles_rls_and_admin_mgmt.sql) — este
// endpoint es el único camino de escritura, y usa el user.id de la sesión
// (no uno recibido del body) para que nadie pueda tocar el tema de otro.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let theme: unknown;
  try {
    ({ theme } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (typeof theme !== "string" || !VALID_THEMES.includes(theme as (typeof VALID_THEMES)[number])) {
    return NextResponse.json({ error: "Tema inválido" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("profiles").update({ theme }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, theme });
}
