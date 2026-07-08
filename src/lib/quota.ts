import { createServiceClient } from "@/lib/supabase/server";

export interface QuotaCheck {
  ok: boolean;
  limit: number | null; // null = sin límite
  used: number;
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Cuota mensual de mensajes de IA (respuestas del asistente) por usuario.
// Override por miembro (allowed_members.monthly_message_limit) o default
// global (app_settings.default_monthly_message_limit). NULL en cualquiera de
// los dos significa "sin límite" en esa capa.
export async function checkMessageQuota(userId: string, email: string): Promise<QuotaCheck> {
  const service = createServiceClient();

  const [{ data: member }, { data: settings }] = await Promise.all([
    service.from("allowed_members").select("monthly_message_limit").eq("email", email).single(),
    service.from("app_settings").select("default_monthly_message_limit").eq("id", 1).single(),
  ]);

  const limit = member?.monthly_message_limit ?? settings?.default_monthly_message_limit ?? null;
  if (limit == null) return { ok: true, limit: null, used: 0 };

  const { count } = await service
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "assistant")
    .gte("created_at", startOfMonthIso());

  const used = count ?? 0;
  return { ok: used < limit, limit, used };
}
