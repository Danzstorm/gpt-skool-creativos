import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Bot, Users } from "lucide-react";

export default async function AdminDashboard() {
  const supabase = createServiceClient();

  const [{ count: gptCount }, { count: memberCount }] = await Promise.all([
    supabase.from("gpts").select("*", { count: "exact", head: true }),
    supabase.from("allowed_members").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard Admin</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link href="/admin/gpts" className="bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-2xl p-6 transition group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center">
              <Bot className="text-purple-400" size={24} />
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{gptCount ?? 0}</div>
              <div className="text-gray-400 text-sm">GPTs activos</div>
            </div>
          </div>
        </Link>

        <Link href="/admin/members" className="bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-2xl p-6 transition group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center">
              <Users className="text-purple-400" size={24} />
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{memberCount ?? 0}</div>
              <div className="text-gray-400 text-sm">Miembros con acceso</div>
            </div>
          </div>
        </Link>
      </div>

      <div className="flex gap-3">
        <Link href="/admin/gpts" className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition">
          Gestionar GPTs
        </Link>
        <Link href="/admin/members" className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition">
          Gestionar miembros
        </Link>
      </div>
    </div>
  );
}
