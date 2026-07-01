import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

  if (error || !data) {
    return NextResponse.json(
      { error: "No tienes acceso. Únete al Skool de Creativos para obtener acceso." },
      { status: 403 }
    );
  }

  if (!data.is_active) {
    return NextResponse.json(
      { error: "Tu acceso ha sido revocado. Contacta al administrador." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
