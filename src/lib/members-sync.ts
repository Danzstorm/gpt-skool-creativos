import type { SupabaseClient } from "@supabase/supabase-js";

// Miembro entrante, ya sea del CSV (admin UI) o de un POST bulk (Zapier/Make).
export type IncomingMember = {
  email: string;
  full_name?: string | null;
  tier?: string | null;
  ltv?: number | null;
  price?: number | null;
  recurring_interval?: string | null;
  joined_date?: string | null;
  invited_by?: string | null;
};

export type SyncResult = {
  imported: number;
  revoked: number;
  warning?: string;
};

// Lógica única de importación/reconciliación de miembros, compartida entre el
// import de CSV del admin y el endpoint bulk auth-por-secreto (Zapier).
//
// sync=true → el lote es fuente de verdad: filas marcadas 'skool_csv' y se
// revocan las 'skool_csv' activas ausentes del lote (dejaron Skool). Los
// miembros 'manual' NUNCA se tocan. Guardarraíl: si el lote trae <60% de los
// activos actuales (export parcial/corrupto), NO revoca masivamente y avisa.
export async function syncMembers(
  service: SupabaseClient,
  members: IncomingMember[],
  sync: boolean
): Promise<SyncResult> {
  const emails = members.map((m) => m.email.toLowerCase().trim());

  const { data, error } = await service
    .from("allowed_members")
    .upsert(
      members.map((m) => ({
        email: m.email.toLowerCase().trim(),
        full_name: m.full_name || null,
        is_active: true,
        ...(sync && { source: "skool_csv" }),
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

  if (error) throw new Error(error.message);

  let revoked = 0;
  let warning: string | undefined;

  if (sync) {
    const { data: existing } = await service
      .from("allowed_members")
      .select("email")
      .eq("source", "skool_csv")
      .eq("is_active", true);

    const existingCount = existing?.length ?? 0;

    if (existingCount > 20 && emails.length < existingCount * 0.6) {
      warning = `Import parcial detectado (${emails.length} filas vs ${existingCount} activos). No se revocó a nadie por seguridad. Sube el export completo de Skool.`;
    } else {
      const importedSet = new Set(emails);
      const toRevoke = (existing ?? []).map((r) => r.email).filter((e) => !importedSet.has(e));

      for (let i = 0; i < toRevoke.length; i += 200) {
        const chunk = toRevoke.slice(i, i + 200);
        await service.from("allowed_members").update({ is_active: false }).in("email", chunk);
      }
      revoked = toRevoke.length;
    }
  }

  return { imported: data?.length ?? 0, revoked, ...(warning && { warning }) };
}
