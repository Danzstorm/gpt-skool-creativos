import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

// Compara en tiempo constante hasheando ambos valores primero: evita tanto el
// leak de timing por longitud (timingSafeEqual falla si los buffers difieren
// en tamaño) como por contenido.
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

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
  if (!expected || !secret || !secretsMatch(secret, expected)) {
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

  // Métricas opcionales (si Zapier las manda desde el pago de Skool). Se limpian igual que el CSV.
  const num = (v: unknown) => {
    if (v == null) return undefined;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (v: unknown) => {
    const s = v == null ? "" : String(v).trim();
    return s || undefined;
  };
  const dateVal = (v: unknown) => {
    const s = v == null ? "" : String(v).trim();
    return s ? s.slice(0, 10) : undefined;
  };

  const fullName = str(body.full_name || body.name || body.fullName);
  const tier = str(body.tier);
  const ltv = num(body.ltv ?? body.LTV);
  const price = num(body.price ?? body.Price);
  const recurring = str(body.recurring_interval ?? body["Recurring Interval"]);
  const joinedDate = dateVal(body.joined_date ?? body.JoinedDate);
  const invitedBy = str(body.invited_by ?? body["Invited By"]);

  const { error } = await service.from("allowed_members").upsert(
    {
      email,
      is_active: true,
      source: "skool_webhook",
      ...(fullName ? { full_name: fullName } : {}),
      ...(tier ? { tier } : {}),
      ...(ltv !== undefined ? { ltv } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(recurring ? { recurring_interval: recurring } : {}),
      ...(joinedDate ? { joined_date: joinedDate } : {}),
      ...(invitedBy ? { invited_by: invitedBy } : {}),
    },
    { onConflict: "email" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, email, action: "activated" });
}
