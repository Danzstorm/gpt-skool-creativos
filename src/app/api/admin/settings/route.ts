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
  const { data, error } = await service.from("app_settings").select("*").eq("id", 1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- body de forma libre, validado campo a campo abajo
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { community_name, logo_url, skool_url, support_email, default_monthly_message_limit } = body;

  const service = createServiceClient();
  const { data, error } = await service
    .from("app_settings")
    .update({
      ...(community_name !== undefined && { community_name }),
      ...(logo_url !== undefined && { logo_url }),
      ...(skool_url !== undefined && { skool_url }),
      ...(support_email !== undefined && { support_email }),
      ...(default_monthly_message_limit !== undefined && { default_monthly_message_limit }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
