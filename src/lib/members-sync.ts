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

// Margen para las altas por webhook frente a un CSV exportado antes que ellas.
// 48h cubre que el export se suba con un día de atraso sin dejar a nadie fuera.
const WEBHOOK_GRACE_HOURS = 48;

export type SyncResult = {
  imported: number;
  revoked: number;
  revokedEmails: string[];
  warning?: string;
};

// Lógica única de importación/reconciliación de miembros, compartida entre el
// import de CSV del admin y el endpoint bulk auth-por-secreto (Zapier).
//
// sync=true → el lote MANDA sobre todos: se revoca a cualquier activo ausente
// del lote, sin importar cómo entró (CSV o webhook de Zapier). Antes solo se
// consideraban las filas 'skool_csv', así que quien entraba por Zapier quedaba
// fuera del alcance de la revocación y conservaba acceso para siempre si
// cancelaba sin llegar a aparecer en ningún export.
//
// Excepciones, las únicas: los admins y las altas manuales. El panel admin es
// la vía para dar de alta a un admin, y todo el resto debe existir en Skool.
// Se protege por `profiles.is_admin` Y por `source='manual'` porque un admin
// recién dado de alta todavía no tiene perfil (se crea en su primer login) y
// en esa ventana `is_admin` aún no existe para protegerlo.
//
// Guardarraíl: si el lote trae <60% de los revocables activos (export parcial o
// corrupto), NO revoca masivamente y avisa.
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
  let revokedEmails: string[] = [];
  let warning: string | undefined;

  if (sync) {
    // Admins por bandera real, no por `source`: si un admin llega a aparecer en
    // el CSV, el upsert de arriba le reescribe `source` a 'skool_csv' y perdería
    // cualquier protección basada en ese campo, revocándose el acceso a su
    // propio panel al primer export donde no figure.
    const { data: adminRows } = await service
      .from("profiles")
      .select("email")
      .eq("is_admin", true);
    const adminEmails = new Set(
      (adminRows ?? [])
        .map((a) => (a.email ?? "").toLowerCase().trim())
        .filter(Boolean)
    );

    const { data: existing } = await service
      .from("allowed_members")
      .select("email, source, added_at")
      .eq("is_active", true);

    // Los exports de Skool se descargan a mano y se suben más tarde, mientras
    // Zapier sigue dando de alta cada pocos minutos. Quien entra DESPUÉS de que
    // se generó el CSV no figura en él, y sin esta ventana se lo revocaría de
    // inmediato: tendría acceso, lo perdería, y solo volvería en la carga
    // siguiente. Se les da margen a las altas recientes por webhook.
    const graceCutoff = Date.now() - WEBHOOK_GRACE_HOURS * 3600_000;
    const inGracePeriod = (r: { source: string | null; added_at: string | null }) =>
      r.source === "skool_webhook" &&
      r.added_at != null &&
      new Date(r.added_at).getTime() > graceCutoff;

    const revocable = (existing ?? []).filter(
      (r) => r.source !== "manual" && !adminEmails.has(r.email) && !inGracePeriod(r)
    );
    const existingCount = revocable.length;

    if (existingCount > 20 && emails.length < existingCount * 0.6) {
      warning = `Import parcial detectado (${emails.length} filas vs ${existingCount} activos). No se revocó a nadie por seguridad. Sube el export completo de Skool.`;
    } else {
      const importedSet = new Set(emails);
      const toRevoke = revocable.map((r) => r.email).filter((e) => !importedSet.has(e));

      for (let i = 0; i < toRevoke.length; i += 200) {
        const chunk = toRevoke.slice(i, i + 200);
        await service.from("allowed_members").update({ is_active: false }).in("email", chunk);
      }
      revoked = toRevoke.length;
      revokedEmails = toRevoke;
    }
  }

  return { imported: data?.length ?? 0, revoked, revokedEmails, ...(warning && { warning }) };
}
