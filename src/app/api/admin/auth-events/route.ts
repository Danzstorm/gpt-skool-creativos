import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

// Historia de sesiones: quién entró, a quién se rechazó y por qué, y qué cerró
// cada sesión. Es lo que convierte "me sacó y no sé por qué" en una respuesta.
// Acepta ?email= para seguir el rastro de una persona concreta.
export async function GET(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const email = request.nextUrl.searchParams.get("email")?.toLowerCase().trim();

  const service = createServiceClient();
  let query = service
    .from("auth_events")
    .select("id, email, event, provider, reason, ip, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (email) query = query.ilike("email", `%${email}%`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
