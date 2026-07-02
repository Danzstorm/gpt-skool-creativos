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

  const { members } = await request.json();
  if (!Array.isArray(members) || members.length === 0) {
    return NextResponse.json({ error: "Lista de miembros requerida" }, { status: 400 });
  }

  type IncomingMember = {
    email: string;
    full_name?: string;
    tier?: string | null;
    ltv?: number | null;
    price?: number | null;
    recurring_interval?: string | null;
    joined_date?: string | null;
    invited_by?: string | null;
  };

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("allowed_members")
    .upsert(
      (members as IncomingMember[]).map((m) => ({
        email: m.email.toLowerCase().trim(),
        full_name: m.full_name || null,
        is_active: true,
        ...(m.tier !== undefined && { tier: m.tier }),
        ...(m.ltv !== undefined && { ltv: m.ltv }),
        ...(m.price !== undefined && { price: m.price }),
        ...(m.recurring_interval !== undefined && { recurring_interval: m.recurring_interval }),
        ...(m.joined_date !== undefined && { joined_date: m.joined_date }),
        ...(m.invited_by !== undefined && { invited_by: m.invited_by }),
      })),
      { onConflict: "email" }
    )
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: data?.length ?? 0 });
}
