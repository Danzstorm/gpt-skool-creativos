import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, clientIp } from "@/lib/rate-limit";
import { getAppSettings } from "@/lib/app-settings";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Endpoint público (corre antes del login) — rate limit por IP para frenar
  // enumeración por fuerza bruta de emails.
  const rl = await checkRateLimit(`check-email:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  if (typeof email !== "string" || email.trim() === "") {
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
