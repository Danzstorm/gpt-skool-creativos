import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Webhook genérico para automatizar altas/bajas desde Skool.
// Funciona con cualquier fuente que pueda hacer un POST: webhook nativo de Skool,
// Make, Zapier, etc. Autenticado con un secreto compartido (SKOOL_WEBHOOK_SECRET).
//
// Uso:
//   POST /api/webhooks/skool
//   Header:  x-webhook-secret: <SKOOL_WEBHOOK_SECRET>   (o ?secret= en la URL)
//   Body JSON: { "email": "...", "action": "add" | "remove", "full_name"?: "..." }
//   action por defecto: "add".

// Palabras que cuentan como baja. Cualquier otra acción se trata como alta.
const REMOVE = new Set(["remove", "delete", "cancel", "cancelled", "revoke", "member_removed", "churn"]);

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("x-webhook-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    "";

  const expected = process.env.SKOOL_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = String(body.email || body.Email || "").toLowerCase().trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const rawAction = String(body.action || body.event || "add").toLowerCase().trim();
  // Solo se revoca si la acción es explícitamente de baja; cualquier otra cosa = alta.
  const action: "add" | "remove" = REMOVE.has(rawAction) ? "remove" : "add";

  const service = createServiceClient();

  if (action === "remove") {
    const { error } = await service
      .from("allowed_members")
      .update({ is_active: false })
      .eq("email", email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, email, action: "revoked" });
  }

  const fullName = body.full_name || body.name || body.fullName;
  const { error } = await service.from("allowed_members").upsert(
    {
      email,
      is_active: true,
      source: "skool_webhook",
      ...(fullName ? { full_name: String(fullName) } : {}),
    },
    { onConflict: "email" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, email, action: "activated" });
}
