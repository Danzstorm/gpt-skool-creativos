import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return profile?.is_admin ? user : null;
}

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
// en `profiles`), queda admin al instante. Si nunca ha entrado, se le
// garantiza acceso (alta/reactivación en allowed_members) y se avisa que hay
// que esperar su primer login antes de que aparezca aquí para promoverla —
// is_admin vive en `profiles`, que solo existe tras el primer login (trigger).
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

  // Garantiza acceso a la plataforma (gate de login) — sin esto, aunque se
  // marque is_admin más tarde, la persona no podría ni iniciar sesión.
  await service
    .from("allowed_members")
    .upsert({ email: normalized, is_active: true }, { onConflict: "email", ignoreDuplicates: false });

  const { data: profile } = await service
    .from("profiles")
    .select("id, email, full_name, is_admin, created_at")
    .eq("email", normalized)
    .single();

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
