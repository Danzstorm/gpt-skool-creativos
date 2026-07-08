import { createClient, createServiceClient } from "@/lib/supabase/server";
import { syncMembers, type IncomingMember } from "@/lib/members-sync";
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

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("allowed_members")
    .select("*")
    .order("added_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // sync=true (import CSV): el CSV es fuente de verdad. Se marcan como 'skool_csv'
  // y se revocan las filas 'skool_csv' que ya no aparecen (dejaron Skool).
  // Los miembros 'manual' (admin, altas a mano) NUNCA se tocan por sync.
  let members: unknown, sync: unknown;
  try {
    ({ members, sync } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!Array.isArray(members) || members.length === 0) {
    return NextResponse.json({ error: "Lista de miembros requerida" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  try {
    const result = await syncMembers(serviceClient, members as IncomingMember[], Boolean(sync));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de importación" },
      { status: 500 }
    );
  }
}
