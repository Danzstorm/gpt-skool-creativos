import { createServiceClient } from "@/lib/supabase/server";
import { syncMembers, type IncomingMember } from "@/lib/members-sync";
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

// Comparación en tiempo constante (mismo enfoque que el webhook por-evento).
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Import bulk de miembros SIN sesión admin — para automatizar el CSV diario de
// Skool vía Zapier/Make (subida programada del export completo).
//
// Uso:
//   POST /api/webhooks/skool/bulk
//   Header:  x-webhook-secret: <SKOOL_WEBHOOK_SECRET>   (o ?secret= en la URL)
//   Body JSON: { "members": [ {..fila..}, ... ], "sync"?: true }
//
// Cada fila acepta campos normalizados (email, full_name, tier, ltv, ...) o los
// encabezados crudos de Skool (Email, FirstName, LastName, Tier, LTV, Price,
// "Recurring Interval", JoinedDate, "Invited By"). sync por defecto = true:
// el lote es la fuente de verdad y reconcilia bajas (mismo guardarraíl <60%).

type RawRow = Record<string, unknown>;

const str = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s || undefined;
};
const num = (v: unknown) => {
  if (v == null) return undefined;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};
const dateVal = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s ? s.slice(0, 10) : undefined;
};

function normalize(row: RawRow): IncomingMember | null {
  const email = String(row.email ?? row.Email ?? row.EMAIL ?? "").toLowerCase().trim();
  if (!email.includes("@")) return null;

  const first = str(row.FirstName ?? row["First Name"]);
  const last = str(row.LastName ?? row["Last Name"]);
  const composed = [first, last].filter(Boolean).join(" ").trim();
  const full_name =
    str(row.full_name) ?? (composed || undefined) ?? str(row.Name ?? row["Full Name"]);

  return {
    email,
    full_name: full_name ?? null,
    tier: str(row.tier ?? row.Tier) ?? null,
    ltv: num(row.ltv ?? row.LTV) ?? null,
    price: num(row.price ?? row.Price) ?? null,
    recurring_interval: str(row.recurring_interval ?? row["Recurring Interval"]) ?? null,
    joined_date: dateVal(row.joined_date ?? row.JoinedDate ?? row["Joined Date"]) ?? null,
    invited_by: str(row.invited_by ?? row["Invited By"]) ?? null,
  };
}

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("x-webhook-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    "";

  const expected = process.env.SKOOL_WEBHOOK_SECRET;
  if (!expected || !secret || !secretsMatch(secret, expected)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { members?: unknown; sync?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.members) || body.members.length === 0) {
    return NextResponse.json({ error: "members[] requerido" }, { status: 400 });
  }

  const members = (body.members as RawRow[])
    .map(normalize)
    .filter((m): m is IncomingMember => m !== null);

  if (members.length === 0) {
    return NextResponse.json({ error: "Ninguna fila con email válido" }, { status: 400 });
  }

  // sync por defecto true (reconciliación diaria); pasar sync:false para solo altas.
  const sync = body.sync === undefined ? true : Boolean(body.sync);

  const service = createServiceClient();
  // Se awaitea: sin await la función serverless responde y el runtime la congela
  // antes de que el insert salga, perdiendo el evento de forma intermitente.
  // El catch mantiene el best-effort — un fallo de auditoría no tumba el import.
  const logEvent = async (success: boolean, error?: string) => {
    try {
      await service
        .from("webhook_events")
        .insert({ source: "skool_bulk", email: null, action: sync ? "bulk_sync" : "bulk_import", success, error });
    } catch {
      // no bloquear la respuesta por un fallo de auditoría
    }
  };

  try {
    const result = await syncMembers(service, members, sync);
    await logEvent(true, result.warning);
    return NextResponse.json({ ...result, received: body.members.length, valid: members.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de importación";
    await logEvent(false, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
