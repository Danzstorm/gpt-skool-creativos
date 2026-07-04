import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Bot, Users, MessageSquare, Activity, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES = {
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

// Aislado del render: este componente de servidor corre una vez por request
// (no hay re-render idempotente que preservar), pero el linter de pureza de
// React no distingue eso — se calcula afuera para no marcar Date.now() como impuro.
function rangeToDates(rangeKey: RangeKey): { since: string; until: string } {
  const days = RANGES[rangeKey].days;
  const now = Date.now();
  return {
    until: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    since: days ? new Date(now - days * 24 * 60 * 60 * 1000).toISOString() : new Date(0).toISOString(),
  };
}

export default async function AdminDashboard({ searchParams }: Props) {
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
  ] = await Promise.all([
    supabase.from("gpts").select("*", { count: "exact", head: true }),
    supabase.from("allowed_members").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("threads").select("*", { count: "exact", head: true }),
    supabase.rpc("admin_usage_summary", { since, until }),
    supabase.rpc("admin_top_users", { since, until, result_limit: 15 }),
    supabase.rpc("admin_stats_summary", { since, until }),
  ]);

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
