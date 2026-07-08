import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getAppSettings } from "@/lib/app-settings";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Endpoint público (corre antes del login) — rate limit por IP para frenar
  // enumeración por fuerza bruta de emails.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`check-email:${ip}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email requerido." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("allowed_members")
    .select("id, is_active")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error || !data || !data.is_active) {
    // Mensaje único: no revela si el email no está registrado o fue revocado,
    // para no facilitar enumeración de miembros de la comunidad.
    const settings = await getAppSettings();
    return NextResponse.json(
      { error: `No tienes acceso. Únete al Skool de ${settings.community_name} para obtener acceso.` },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
