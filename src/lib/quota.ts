import { createServiceClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/membership";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuotaCheck {
  ok: boolean;
  limit: number | null; // null = sin límite
  used: number;
}

export type QuotaServiceClient = SupabaseClient;

export type QuotaDeps = {
  service: QuotaServiceClient;
  now: () => Date;
};

/** Inicio del mes calendario UTC en ISO 8601 (corte de cuota mensual). */
export function startOfMonthIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Cuota mensual de mensajes de IA (respuestas del asistente) por usuario.
// Override por miembro (allowed_members.monthly_message_limit) o default
// global (app_settings.default_monthly_message_limit). NULL en cualquiera de
// los dos significa "sin límite" en esa capa.
export async function checkMessageQuotaWithDeps(
  userId: string,
  email: string,
  deps: QuotaDeps
): Promise<QuotaCheck> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, limit: null, used: 0 };
  }

  const [{ data: member }, { data: settings }] = await Promise.all([
    deps.service
      .from("allowed_members")
      .select("monthly_message_limit")
      .eq("email", normalizedEmail)
      .single(),
    deps.service.from("app_settings").select("default_monthly_message_limit").eq("id", 1).single(),
  ]);

  const limit = member?.monthly_message_limit ?? settings?.default_monthly_message_limit ?? null;
  if (limit == null) return { ok: true, limit: null, used: 0 };

  const monthStart = startOfMonthIso(deps.now());
  const { count, error } = await deps.service
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "assistant")
    .gte("created_at", monthStart);

  if (error) {
    // Fail-closed: con límite configurado no se puede verificar el uso.
    return { ok: false, limit, used: 0 };
  }

  const used = count ?? 0;
  return { ok: used < limit, limit, used };
}

export async function checkMessageQuota(userId: string, email: string): Promise<QuotaCheck> {
  if (!normalizeEmail(email)) {
    return { ok: false, limit: null, used: 0 };
  }
  return checkMessageQuotaWithDeps(userId, email, {
    service: createServiceClient(),
    now: () => new Date(),
  });
}
