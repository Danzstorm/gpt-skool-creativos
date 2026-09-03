import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, email, full_name, is_admin, created_at")
    .eq("is_admin", true)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Da admin por correo. Si la persona ya inició sesión alguna vez (tiene fila
// en `profiles`), queda admin al instante. Si nunca ha entrado, se le garantiza
// acceso y se deja marcado `pending_admin`: el trigger handle_new_user lo
// aplica solo en su primer login. Antes esto devolvía "pending" a secas y la UI
// pedía volver a agregarlo a mano más tarde — un paso que se olvidaba y dejaba
// al nuevo admin sin panel.
export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  }
  const normalized = email.toLowerCase().trim();

  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id, email, full_name, is_admin, created_at")
    .eq("email", normalized)
    .maybeSingle();

  // Garantiza acceso a la plataforma (gate de login) — sin esto, aunque se
  // marque is_admin más tarde, la persona no podría ni iniciar sesión.
  // `pending_admin` solo se enciende si aún no hay perfil: si ya existe, se
  // promueve abajo y dejar el flag encendido lo re-promovería tras un DELETE.
  const { error: accessError } = await service.from("allowed_members").upsert(
    { email: normalized, is_active: true, ...(profile ? {} : { pending_admin: true }) },
    { onConflict: "email", ignoreDuplicates: false }
  );
  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ status: "pending" as const });
  }

  const { data: updated, error } = await service
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", profile.id)
    .select("id, email, full_name, is_admin, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "promoted" as const, profile: updated });
}
