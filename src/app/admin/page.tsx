import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import Link from "next/link";
import { Bot, Users, MessageSquare, Activity, DollarSign, RefreshCw, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES = {
  "1d": { label: "24 h", days: 1 },
  "7d": { label: "7 días", days: 7 },
  "30d": { label: "30 días", days: 30 },
  "90d": { label: "90 días", days: 90 },
  all: { label: "Todo", days: null },
} as const;
type RangeKey = keyof typeof RANGES;

interface Props {
  searchParams: Promise<{ range?: string }>;
}

interface GptSummaryRow {
  gpt_id: string | null;
  gpt_name: string | null;
  message_count: number;
  tokens_in: number;
  tokens_out: number;
  total_cost: number;
  unique_users: number;
}

interface TopUserRow {
  user_id: string;
  email: string | null;
  message_count: number;
  gpt_count: number;
  thread_count: number;
  total_cost: number;
}

interface StatsSummaryRow {
  message_count: number;
  total_cost: number;
  active_users: number;
}

interface SignupRow {
  email: string;
  full_name: string | null;
  joined_at: string;
  first_login_at: string | null;
  first_message_at: string | null;
}

interface SignupSummaryRow {
  joined_skool: number;
  entered_web: number;
  used_chat: number;
}

// Cuántas altas de Zapier se listan con nombre; el resto queda en el conteo y
// en la actividad de integración de /admin/members.
const SIGNUPS_SHOWN = 8;

// Aislado del render: este componente de servidor corre una vez por request
// (no hay re-render idempotente que preservar), pero el linter de pureza de
// React no distingue eso — se calcula afuera para no marcar Date.now() como impuro.
// Días completos transcurridos desde una fecha ISO, o null si nunca ocurrió.
// Vive fuera del componente por la misma razón que rangeToDates: leer el reloj
// en el cuerpo del render es una llamada impura.
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function rangeToDates(rangeKey: RangeKey): { since: string; until: string } {
  const days = RANGES[rangeKey].days;
  const now = Date.now();
  return {
    until: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    since: days ? new Date(now - days * 24 * 60 * 60 * 1000).toISOString() : new Date(0).toISOString(),
  };
}

export default async function AdminDashboard({ searchParams }: Props) {
  // El layout de /admin ya comprueba is_admin, pero un layout NO es una frontera
  // de autorización: no se vuelve a ejecutar en navegaciones de cliente entre
  // rutas hermanas, así que confiar solo en él es el footgun documentado de Next.
  // Esta página es además la única que abre un cliente service_role y lee emails
  // de miembros y costos, o sea la que menos puede permitirse el atajo. Todas sus
  // hermanas (/api/admin/*) revalidan; esta también.
  if (!(await requireAdmin())) redirect("/dashboard?notice=not_admin");

  const { range } = await searchParams;
  const rangeKey: RangeKey = range && range in RANGES ? (range as RangeKey) : "30d";
  const { since, until } = rangeToDates(rangeKey);

  const supabase = createServiceClient();

  const [
    { count: gptCount },
    { count: memberCount },
    { count: threadCount },
    { data: gptSummary },
    { data: topUsers },
    { data: statsSummary },
    { data: signupRows },
    { data: signupSummary },
    { data: firstWebLogins },
  ] = await Promise.all([
    supabase.from("gpts").select("*", { count: "exact", head: true }),
    supabase.from("allowed_members").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("threads").select("*", { count: "exact", head: true }),
    supabase.rpc("admin_usage_summary", { since, until }),
    supabase.rpc("admin_top_users", { since, until, result_limit: 15 }),
    supabase.rpc("admin_stats_summary", { since, until }),
    supabase.rpc("admin_skool_signups", { since, until, result_limit: SIGNUPS_SHOWN }),
    supabase.rpc("admin_skool_signups_summary", { since, until }),
    supabase.rpc("admin_first_web_logins", { since, until }),
  ]);

  // Embudo de altas: Zapier avisa que alguien PAGÓ en Skool, no que entró acá.
  // Estos tres números son la diferencia entre "tengo 40 miembros nuevos" y
  // "de esos 40, 12 abrieron la plataforma y 5 la usaron".
  const signups = (signupRows as SignupRow[] | null) ?? [];
  const funnel = (signupSummary as SignupSummaryRow[] | null)?.[0];
  const joinedSkool = Number(funnel?.joined_skool ?? 0);
  const enteredWeb = Number(funnel?.entered_web ?? 0);
  const usedChat = Number(funnel?.used_chat ?? 0);
  const pct = (n: number) => (joinedSkool ? ` · ${Math.round((n / joinedSkool) * 100)}%` : "");

  // Las altas llegan solas por Zapier, pero las BAJAS solo se aplican cuando
  // alguien sube el CSV completo de Skool. Si eso se deja de hacer nada falla de
  // forma visible: quien cancela simplemente sigue entrando, y el consumo de la
  // API se sigue pagando. Este dato convierte ese olvido en algo que se ve.
  const { data: lastSyncRow } = await supabase
    .from("webhook_events")
    .select("created_at")
    .eq("action", "bulk_sync")
    .eq("success", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const daysSinceSync = daysSince(lastSyncRow?.created_at ?? null);
  // Con export diario, 2 días ya es atraso. Sin registro previo se avisa igual:
  // puede ser que nunca se haya sincronizado.
  const syncIsStale = daysSinceSync === null || daysSinceSync >= 2;

  const topGpts = ((gptSummary as GptSummaryRow[] | null) ?? []).map((g) => ({
    name: g.gpt_name ?? "GPT eliminado",
    n: Number(g.message_count),
    cost: Number(g.total_cost),
  }));

  const users = ((topUsers as TopUserRow[] | null) ?? []).map((u) => ({
    email: u.email ?? "—",
    messages: Number(u.message_count),
    gpts: Number(u.gpt_count),
    threads: Number(u.thread_count),
    cost: Number(u.total_cost),
  }));

  const summary = (statsSummary as StatsSummaryRow[] | null)?.[0];
  const totalMessages = Number(summary?.message_count ?? 0);
  const totalCost = Number(summary?.total_cost ?? 0);
  const activeUsers = Number(summary?.active_users ?? 0);

  const money = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

  const stats = [
    { icon: Bot, label: "GPTs activos", value: gptCount ?? 0, href: "/admin/gpts" },
    { icon: Users, label: "Miembros con acceso", value: memberCount ?? 0, href: "/admin/members" },
    { icon: MessageSquare, label: "Mensajes en el período", value: totalMessages },
    { icon: Activity, label: "Usuarios activos", value: activeUsers },
    { icon: DollarSign, label: "Costo estimado (OpenAI)", value: money(totalCost) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Dashboard Admin</h1>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {(Object.keys(RANGES) as RangeKey[]).map((key) => (
            <Link
              key={key}
              href={`/admin?range=${key}`}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition",
                rangeKey === key
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              {RANGES[key].label}
            </Link>
          ))}
        </div>
      </div>

      <Link
        href="/admin/members"
        className={cn(
          "mb-6 flex items-center gap-3 rounded-2xl border px-5 py-4 transition hover:opacity-90",
          syncIsStale
            ? "border-amber-800/60 bg-amber-950/30"
            : "border-zinc-800 bg-zinc-900"
        )}
      >
        <RefreshCw
          size={20}
          className={syncIsStale ? "text-amber-400" : "text-violet-400"}
        />
        <div className="min-w-0">
          <div className={cn("text-sm font-medium", syncIsStale ? "text-amber-200" : "text-white")}>
            {daysSinceSync === null
              ? "Nunca se sincronizó la lista de miembros"
              : daysSinceSync === 0
                ? "Miembros sincronizados hoy"
                : `Última sincronización de miembros: hace ${daysSinceSync} ${daysSinceSync === 1 ? "día" : "días"}`}
          </div>
          <div className="mt-0.5 text-xs text-zinc-400">
            {syncIsStale
              ? "Las bajas de Skool solo se aplican al subir el CSV completo. Hasta entonces, quien canceló sigue teniendo acceso."
              : "Las altas entran solas por Zapier; el CSV es lo que aplica las bajas."}
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map(({ icon: Icon, label, value, href }) => {
          const card = (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 h-full">
              <Icon className="text-violet-400 mb-3" size={22} />
              <div className="text-3xl font-bold text-white">{value}</div>
              <div className="text-zinc-400 text-sm mt-0.5">{label}</div>
            </div>
          );
          return href ? (
            <Link key={label} href={href} className="hover:opacity-90 transition">
              {card}
            </Link>
          ) : (
            <div key={label}>{card}</div>
          );
        })}
      </div>

      {/* Nuevos miembros: lo que Zapier dio de alta vs. quién llegó a usar la web */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <UserPlus size={18} className="text-violet-400" />
            Nuevos miembros · {RANGES[rangeKey].label}
          </h2>
          <span className="text-xs text-zinc-500">
            {Number(firstWebLogins ?? 0)} entraron a la web por primera vez (incluye miembros antiguos)
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Entraron a Skool (Zapier)", value: joinedSkool, hint: "" },
            { label: "Ya abrieron la web", value: enteredWeb, hint: pct(enteredWeb) },
            { label: "Ya chatearon", value: usedChat, hint: pct(usedChat) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-zinc-950/60 border border-zinc-800 px-4 py-3">
              <div className="text-2xl font-bold text-white tabular-nums">
                {s.value}
                <span className="text-sm font-medium text-zinc-500">{s.hint}</span>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {signups.length === 0 ? (
          <p className="text-zinc-500 text-sm">Zapier no dio de alta a nadie en este período.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-800">
              {signups.map((s) => {
                const status = s.first_message_at
                  ? { text: "Chateó", tone: "bg-green-900/30 text-green-400" }
                  : s.first_login_at
                    ? { text: "Entró", tone: "bg-violet-900/30 text-violet-300" }
                    : { text: "Sin entrar", tone: "bg-zinc-800 text-zinc-400" };
                const days = daysSince(s.joined_at) ?? 0;
                return (
                  <li key={s.email} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-zinc-200 truncate">{s.full_name || s.email}</div>
                      {s.full_name && <div className="text-xs text-zinc-500 truncate">{s.email}</div>}
                    </div>
                    <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                      {days === 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs whitespace-nowrap", status.tone)}>
                      {status.text}
                    </span>
                  </li>
                );
              })}
            </ul>
            {joinedSkool > SIGNUPS_SHOWN && (
              <Link
                href="/admin/members"
                className="mt-3 inline-block text-xs text-violet-300 hover:text-violet-200"
              >
                Ver las {joinedSkool} altas en Miembros → Actividad de integración
              </Link>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GPTs más usados */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4">GPTs más usados</h2>
          {topGpts.length === 0 ? (
            <p className="text-zinc-500 text-sm">Sin uso registrado en este período.</p>
          ) : (
            <div className="space-y-2">
              {topGpts.map((g) => {
                const pct = Math.round((g.n / (topGpts[0].n || 1)) * 100);
                return (
                  <div key={g.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-zinc-300">{g.name}</span>
                      <span className="text-zinc-500">
                        {g.n} · <span className="text-zinc-400">{money(g.cost)}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Usuarios más activos */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4">Usuarios más activos</h2>
          {users.length === 0 ? (
            <p className="text-zinc-500 text-sm">Sin uso registrado en este período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs text-left">
                    <th className="pb-2 font-medium">Usuario</th>
                    <th className="pb-2 font-medium text-right">Msgs</th>
                    <th className="pb-2 font-medium text-right">GPTs</th>
                    <th className="pb-2 font-medium text-right">Chats</th>
                    <th className="pb-2 font-medium text-right">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.email} className="border-t border-zinc-800">
                      <td className="py-2 text-zinc-300 truncate max-w-[160px]">{u.email}</td>
                      <td className="py-2 text-right text-zinc-300 tabular-nums">{u.messages}</td>
                      <td className="py-2 text-right text-zinc-400 tabular-nums">{u.gpts}</td>
                      <td className="py-2 text-right text-zinc-400 tabular-nums">{u.threads}</td>
                      <td className="py-2 text-right text-zinc-400 tabular-nums">{money(u.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-zinc-600 text-xs mt-6">{threadCount ?? 0} conversaciones en total (histórico).</p>
    </div>
  );
}
