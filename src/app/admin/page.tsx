import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import Link from "next/link";
import { cn } from "@/lib/utils";
import AdminChartPanel, { AdminMonthPill, type ChartMetric } from "@/components/admin/AdminChartPanel";
import {
  adminMutedClass,
  adminPanelClass,
  adminRangeCaptionClass,
  adminSummaryTopClass,
  periodPillActiveClass,
  periodPillClass,
} from "@/components/admin/admin-ui";
import {
  activityPct,
  buildDailySeries,
  currentMonthValue,
  enumerateDays,
  fetchAllRows,
  formatCount,
  formatDayLabel,
  formatRangeCaption,
  money,
  parseAdminPeriod,
  periodBounds,
  seriesHasSignal,
  VISIBLE_RANGES,
  type ThreadRow,
  type UsageRow,
} from "@/lib/admin-summary";

interface Props {
  searchParams: Promise<{ range?: string; month?: string }>;
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

const SIGNUPS_SHOWN = 8;
const RANGE_LABELS: Record<(typeof VISIBLE_RANGES)[number], string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
};

// .ax-muted dentro de un panel: 12px, más aire arriba.
const panelMutedClass = "mt-5 text-[12px] leading-[1.8] text-[#74747f]";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function AdminDashboard({ searchParams }: Props) {
  if (!(await requireAdmin())) redirect("/chat?notice=not_admin");

  const params = await searchParams;
  const period = parseAdminPeriod(params);
  const { since, until } = periodBounds(period);
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  const days = enumerateDays(since, until);
  const monthValue = period.kind === "month" ? period.month : currentMonthValue();
  const thisMonth = currentMonthValue();

  const supabase = createServiceClient();

  const [
    { count: memberCount },
    { count: threadCount },
    { data: gptSummary },
    { data: topUsers },
    { data: statsSummary },
    { data: signupRows },
    { data: signupSummary },
    { data: firstWebLogins },
  ] = await Promise.all([
    supabase.from("allowed_members").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("threads").select("*", { count: "exact", head: true }),
    supabase.rpc("admin_usage_summary", { since: sinceIso, until: untilIso }),
    supabase.rpc("admin_top_users", { since: sinceIso, until: untilIso, result_limit: 15 }),
    supabase.rpc("admin_stats_summary", { since: sinceIso, until: untilIso }),
    supabase.rpc("admin_skool_signups", { since: sinceIso, until: untilIso, result_limit: SIGNUPS_SHOWN }),
    supabase.rpc("admin_skool_signups_summary", { since: sinceIso, until: untilIso }),
    supabase.rpc("admin_first_web_logins", { since: sinceIso, until: untilIso }),
  ]);

  let usageRows: UsageRow[] = [];
  let threadRows: ThreadRow[] = [];
  let seriesError = false;
  try {
    [usageRows, threadRows] = await Promise.all([
      fetchAllRows<UsageRow>((from, to) =>
        supabase
          .from("usage_events")
          .select("created_at, user_id, cost")
          .gte("created_at", sinceIso)
          .lt("created_at", untilIso)
          .range(from, to)
      ),
      fetchAllRows<ThreadRow>((from, to) =>
        supabase
          .from("threads")
          .select("created_at")
          .gte("created_at", sinceIso)
          .lt("created_at", untilIso)
          .range(from, to)
      ),
    ]);
  } catch {
    seriesError = true;
  }

  const daily = buildDailySeries(days, usageRows, threadRows);
  const hasSeries = !seriesError && seriesHasSignal(daily);
  const dateLabels = days.map(formatDayLabel);

  const signups = (signupRows as SignupRow[] | null) ?? [];
  const funnel = (signupSummary as SignupSummaryRow[] | null)?.[0];
  const joinedSkool = Number(funnel?.joined_skool ?? 0);
  const enteredWeb = Number(funnel?.entered_web ?? 0);
  const usedChat = Number(funnel?.used_chat ?? 0);
  const pct = (n: number) => (joinedSkool ? ` · ${Math.round((n / joinedSkool) * 100)}%` : "");

  const { data: lastSyncRow } = await supabase
    .from("webhook_events")
    .select("created_at")
    .eq("action", "bulk_sync")
    .eq("success", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const daysSinceSync = daysSince(lastSyncRow?.created_at ?? null);
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
  const members = memberCount ?? 0;
  const newChats = threadRows.length;
  const activity = activityPct(activeUsers, members);

  const usageMetrics: ChartMetric[] = [
    {
      label: "Usuarios activos",
      value: formatCount(activeUsers),
      hint: `De ${formatCount(members)} miembros`,
      series: hasSeries ? daily.map((d) => d.activeUsers) : [],
      format: "count",
      chartLabel: "Usuarios activos por día",
    },
    {
      label: "Actividad",
      value: `${Math.round(activity)}%`,
      hint: "Han usado la plataforma",
      series: hasSeries ? daily.map((d) => activityPct(d.activeUsers, members)) : [],
      format: "percent",
      chartLabel: "Actividad diaria",
    },
    {
      label: "Chats nuevos",
      value: formatCount(newChats),
      hint: `${formatCount(totalMessages)} mensajes`,
      series: hasSeries ? daily.map((d) => d.newThreads) : [],
      format: "count",
      chartLabel: "Chats nuevos por día",
    },
    {
      label: "Mensajes",
      value: formatCount(totalMessages),
      hint: "En el período",
      series: hasSeries ? daily.map((d) => d.messages) : [],
      format: "count",
      chartLabel: "Mensajes por día",
    },
  ];

  const costMetrics: ChartMetric[] = [
    {
      label: "Costo total",
      value: money(totalCost),
      hint: "IA e infraestructura · USD",
      series: hasSeries ? daily.map((d) => d.cost) : [],
      format: "money",
      chartLabel: "Costo diario",
    },
    {
      label: "Por usuario activo",
      value: money(activeUsers ? totalCost / activeUsers : 0),
      hint: "Costo ÷ usuarios únicos",
      series: hasSeries ? daily.map((d) => (d.activeUsers ? d.cost / d.activeUsers : 0)) : [],
      format: "money",
      chartLabel: "Costo por usuario activo diario",
    },
    {
      label: "Por miembro",
      value: money(members ? totalCost / members : 0),
      hint: "Costo ÷ miembros con acceso",
      series: hasSeries ? daily.map((d) => (members ? d.cost / members : 0)) : [],
      format: "money",
      chartLabel: "Costo por miembro diario",
    },
  ];

  const rangeCaption = formatRangeCaption(since, until);
  const hiddenRange = period.kind === "range" && !VISIBLE_RANGES.includes(period.key as (typeof VISIBLE_RANGES)[number]);

  return (
    <div>
      <div className={adminSummaryTopClass}>
        <div>
          Panel de control
          <small className={adminRangeCaptionClass}>{rangeCaption}</small>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap gap-[3px] rounded-[10px] bg-[#111113] p-1">
          {VISIBLE_RANGES.map((key) => (
            <Link
              key={key}
              href={`/admin?range=${key}`}
              className={cn(periodPillClass, period.kind === "range" && period.key === key && periodPillActiveClass)}
            >
              {RANGE_LABELS[key]}
            </Link>
          ))}
          <AdminMonthPill value={monthValue} active={period.kind === "month"} max={thisMonth} />
          {hiddenRange && (
            <span className="sr-only">Rango {period.key} (enlace profundo, no visible en el set del cliente)</span>
          )}
        </div>
      </div>

      <AdminChartPanel title="Uso" chartKey="usage" metrics={usageMetrics} dates={dateLabels} />
      <AdminChartPanel title="Costos" chartKey="cost" metrics={costMetrics} dates={dateLabels} />

      <Link
        href="/admin/members"
        className={cn(
          adminPanelClass,
          "mb-[22px] flex items-center justify-between max-[700px]:items-start max-[700px]:gap-2",
          syncIsStale && "border-[#af7a4033]"
        )}
      >
        <div>
          <strong className="text-[13px] font-normal">
            <span className="mr-[11px] inline-block h-[6px] w-[6px] rounded-full bg-[#af83a1]" />
            {daysSinceSync === null
              ? "Nunca se sincronizó la lista de miembros"
              : daysSinceSync === 0
                ? "Miembros sincronizados hoy"
                : `Última sincronización de miembros: hace ${daysSinceSync} ${daysSinceSync === 1 ? "día" : "días"}`}
          </strong>
          <p className="mt-2 ml-[17px] text-[12px] text-[#82828e]">
            {syncIsStale
              ? "Las bajas de Skool solo se aplican al subir el CSV completo. Hasta entonces, quien canceló sigue teniendo acceso."
              : "Las altas entran solas por Zapier; el CSV es lo que aplica las bajas."}
          </p>
        </div>
      </Link>

      <section className={adminPanelClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="!text-[16px]">Nuevos miembros</h2>
          <span className={panelMutedClass}>
            {Number(firstWebLogins ?? 0)} entraron a la web por primera vez (incluye miembros antiguos)
          </span>
        </div>

        <div className="mb-7 grid gap-4 max-[650px]:gap-[10px]" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {[
            { label: "Entraron a Skool (Zapier)", value: joinedSkool, hint: "" },
            { label: "Ya abrieron la web", value: enteredWeb, hint: pct(enteredWeb) },
            { label: "Ya chatearon", value: usedChat, hint: pct(usedChat) },
          ].map((s) => (
            <div
              key={s.label}
              className="min-w-0 rounded-[14px] border border-solid border-[#ffffff0e] bg-[#111113] p-[22px] max-[650px]:p-4"
            >
              <strong className="mt-[14px] block text-[30px] font-normal">
                {s.value}
                <span className="block text-[12px] leading-[1.5] text-[#9999a2]">{s.hint}</span>
              </strong>
              <small className="mt-[14px] block text-[10px] leading-[1.6] text-[#74747f]">{s.label}</small>
            </div>
          ))}
        </div>

        {signups.length === 0 ? (
          <p className={panelMutedClass}>Zapier no dio de alta a nadie en este período.</p>
        ) : (
          <>
            <ul className="divide-y divide-white/[0.06]">
              {signups.map((s) => {
                const status = s.first_message_at
                  ? { text: "Chateó", tone: "text-green-400" }
                  : s.first_login_at
                    ? { text: "Entró", tone: "text-[#e6bfce]" }
                    : { text: "Sin entrar", tone: "text-[#74747f]" };
                const daysAgo = daysSince(s.joined_at) ?? 0;
                return (
                  <li key={s.email} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[#eeeef2]">{s.full_name || s.email}</div>
                      {s.full_name && <div className="truncate text-xs text-[#74747f]">{s.email}</div>}
                    </div>
                    <span className="whitespace-nowrap text-xs tabular-nums text-[#74747f]">
                      {daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`}
                    </span>
                    <span className={cn("whitespace-nowrap text-xs", status.tone)}>{status.text}</span>
                  </li>
                );
              })}
            </ul>
            {joinedSkool > SIGNUPS_SHOWN && (
              <Link href="/admin/members" className="mt-3 inline-block text-xs text-[#e6bfce]">
                Ver las {joinedSkool} altas en Miembros → Actividad de integración
              </Link>
            )}
          </>
        )}
      </section>

      <div className="mt-5 grid grid-cols-[1.15fr_1fr] gap-5 max-[700px]:grid-cols-1">
        <section className={adminPanelClass}>
          <h2 className="!text-[16px]">GPTs más usados</h2>
          {topGpts.length === 0 ? (
            <p className={panelMutedClass}>Sin uso registrado en este período.</p>
          ) : (
            <div className="space-y-2">
              {topGpts.map((g) => {
                const bar = Math.round((g.n / (topGpts[0].n || 1)) * 100);
                return (
                  <div key={g.name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-[#d3d3d8]">{g.name}</span>
                      <span className="text-[#74747f]">
                        {g.n} · <span className="text-[#9999a5]">{money(g.cost)}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-[#be6589]" style={{ width: `${bar}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={adminPanelClass}>
          <h2 className="!text-[16px]">Usuarios más activos</h2>
          {users.length === 0 ? (
            <p className={panelMutedClass}>Sin uso registrado en este período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#74747f]">
                    <th className="pb-2 font-medium">Usuario</th>
                    <th className="pb-2 text-right font-medium">Msgs</th>
                    <th className="pb-2 text-right font-medium">GPTs</th>
                    <th className="pb-2 text-right font-medium">Chats</th>
                    <th className="pb-2 text-right font-medium">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.email} className="border-t border-white/[0.06]">
                      <td className="max-w-[160px] truncate py-2 text-[#d3d3d8]">{u.email}</td>
                      <td className="py-2 text-right tabular-nums text-[#d3d3d8]">{u.messages}</td>
                      <td className="py-2 text-right tabular-nums text-[#9999a5]">{u.gpts}</td>
                      <td className="py-2 text-right tabular-nums text-[#9999a5]">{u.threads}</td>
                      <td className="py-2 text-right tabular-nums text-[#9999a5]">{money(u.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className={adminMutedClass}>{threadCount ?? 0} conversaciones en total (histórico).</p>
    </div>
  );
}
