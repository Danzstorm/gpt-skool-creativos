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

  // sync=true (import CSV): el CSV es fuente de verdad y reconcilia a TODOS los
  // activos, incluidos los que dio de alta el webhook de Zapier. Las únicas
  // excepciones son los admins, las altas manuales y las altas por webhook de
  // menos de 48h. Ver src/lib/members-sync.ts.
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

  // Se registra igual que los imports por webhook: es la vía que más se usa (el
  // admin sube el CSV a mano) y sin esto el dashboard no puede saber hace cuánto
  // fue la última reconciliación, que es lo único que corta el acceso a quien
  // deja Skool.
  const logEvent = async (success: boolean, error?: string) => {
    try {
      await serviceClient.from("webhook_events").insert({
        source: "admin_csv",
        email: null,
        action: sync ? "bulk_sync" : "bulk_import",
        success,
        error,
      });
    } catch {
      // no bloquear el import por un fallo de auditoría
    }
  };

  try {
    const result = await syncMembers(serviceClient, members as IncomingMember[], Boolean(sync));
    await logEvent(true, result.warning);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de importación";
    await logEvent(false, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
