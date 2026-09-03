import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  let is_active: boolean | undefined;
  let monthly_message_limit: number | null | undefined;
  try {
    ({ is_active, monthly_message_limit } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (is_active !== undefined && typeof is_active !== "boolean") {
    return NextResponse.json({ error: "is_active debe ser booleano" }, { status: 400 });
  }
  // null es intencional: significa "sin límite" (lo consume src/lib/quota.ts).
  if (monthly_message_limit !== undefined && monthly_message_limit !== null) {
    if (
      typeof monthly_message_limit !== "number" ||
      !Number.isInteger(monthly_message_limit) ||
      monthly_message_limit < 0
    ) {
      return NextResponse.json(
        { error: "monthly_message_limit debe ser un entero >= 0 o null" },
        { status: 400 }
      );
    }
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("allowed_members")
    .update({
      ...(is_active !== undefined && { is_active }),
      ...(monthly_message_limit !== undefined && { monthly_message_limit }),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const serviceClient = createServiceClient();
  await serviceClient.from("allowed_members").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
