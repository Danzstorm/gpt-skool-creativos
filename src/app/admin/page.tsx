import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Bot, Users, MessageSquare, Activity, DollarSign } from "lucide-react";

export default async function AdminDashboard() {
  const supabase = createServiceClient();

  const [
    { count: gptCount },
    { count: memberCount },
    { count: threadCount },
    { data: events },
    { data: gpts },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("gpts").select("*", { count: "exact", head: true }),
    supabase.from("allowed_members").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("threads").select("*", { count: "exact", head: true }),
    supabase.from("usage_events").select("user_id, gpt_id, thread_id, cost, tokens_in, tokens_out").limit(20000),
    supabase.from("gpts").select("id, name"),
    supabase.from("profiles").select("id, email, full_name"),
  ]);

  const rows = events ?? [];
  const gptName = new Map((gpts ?? []).map((g) => [g.id, g.name]));
  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Uso por GPT (mensajes + costo)
  const perGpt = new Map<string, { n: number; cost: number }>();
  // Uso por usuario
  const perUser = new Map<
    string,
    { messages: number; gpts: Set<string>; threads: Set<string>; cost: number }
  >();
  let totalCost = 0;

  for (const e of rows) {
    const cost = Number(e.cost ?? 0);
    totalCost += cost;
    if (e.gpt_id) {
      const g = perGpt.get(e.gpt_id) ?? { n: 0, cost: 0 };
      g.n += 1;
      g.cost += cost;
      perGpt.set(e.gpt_id, g);
    }
    if (e.user_id) {
      const u = perUser.get(e.user_id) ?? { messages: 0, gpts: new Set(), threads: new Set(), cost: 0 };
      u.messages += 1;
      u.cost += cost;
      if (e.gpt_id) u.gpts.add(e.gpt_id);
      if (e.thread_id) u.threads.add(e.thread_id);
      perUser.set(e.user_id, u);
    }
  }

  const topGpts = [...perGpt.entries()]
    .map(([id, g]) => ({ name: gptName.get(id) ?? "GPT eliminado", n: g.n, cost: g.cost }))
    .sort((a, b) => b.n - a.n);

  const topUsers = [...perUser.entries()]
    .map(([id, u]) => ({
      email: profById.get(id)?.email ?? "—",
      messages: u.messages,
      gpts: u.gpts.size,
      threads: u.threads.size,
      cost: u.cost,
    }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 15);

  const money = (n: number) =>
    n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;

  const stats = [
    { icon: Bot, label: "GPTs activos", value: gptCount ?? 0, href: "/admin/gpts" },
    { icon: Users, label: "Miembros con acceso", value: memberCount ?? 0, href: "/admin/members" },
    { icon: MessageSquare, label: "Mensajes totales", value: rows.length },
    { icon: Activity, label: "Usuarios activos", value: perUser.size },
    { icon: DollarSign, label: "Costo estimado (OpenAI)", value: money(totalCost) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard Admin</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map(({ icon: Icon, label, value, href }) => {
          const card = (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 h-full">
              <Icon className="text-purple-400 mb-3" size={22} />
              <div className="text-3xl font-bold text-white">{value}</div>
              <div className="text-gray-400 text-sm mt-0.5">{label}</div>
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4">GPTs más usados</h2>
          {topGpts.length === 0 ? (
            <p className="text-gray-500 text-sm">Aún no hay uso registrado.</p>
          ) : (
            <div className="space-y-2">
              {topGpts.map((g) => {
                const pct = Math.round((g.n / (topGpts[0].n || 1)) * 100);
                return (
                  <div key={g.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{g.name}</span>
                      <span className="text-gray-500">
                        {g.n} · <span className="text-gray-400">{money(g.cost)}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Usuarios más activos */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4">Usuarios más activos</h2>
          {topUsers.length === 0 ? (
            <p className="text-gray-500 text-sm">Aún no hay uso registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs text-left">
                    <th className="pb-2 font-medium">Usuario</th>
                    <th className="pb-2 font-medium text-right">Msgs</th>
                    <th className="pb-2 font-medium text-right">GPTs</th>
                    <th className="pb-2 font-medium text-right">Chats</th>
                    <th className="pb-2 font-medium text-right">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((u) => (
                    <tr key={u.email} className="border-t border-gray-800">
                      <td className="py-2 text-gray-300 truncate max-w-[160px]">{u.email}</td>
                      <td className="py-2 text-right text-gray-300 tabular-nums">{u.messages}</td>
                      <td className="py-2 text-right text-gray-400 tabular-nums">{u.gpts}</td>
                      <td className="py-2 text-right text-gray-400 tabular-nums">{u.threads}</td>
                      <td className="py-2 text-right text-gray-400 tabular-nums">{money(u.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-gray-600 text-xs mt-6">
        {threadCount ?? 0} conversaciones en total.
      </p>
    </div>
  );
}
