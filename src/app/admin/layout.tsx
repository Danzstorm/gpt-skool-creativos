import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Bot, LayoutDashboard } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-baseline gap-2">
              <span className="font-display text-xl font-semibold tracking-tight text-stone-50">
                Creativos
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone-500">
                GPT
              </span>
            </Link>
            <span className="text-stone-600">/</span>
            <span className="text-sm font-medium text-violet-400">Admin</span>
          </div>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-zinc-400 hover:text-white transition flex items-center gap-1.5">
              <LayoutDashboard size={15} /> Dashboard
            </Link>
            <Link href="/admin/gpts" className="text-zinc-400 hover:text-white transition flex items-center gap-1.5">
              <Bot size={15} /> GPTs
            </Link>
            <Link href="/admin/members" className="text-zinc-400 hover:text-white transition flex items-center gap-1.5">
              <Users size={15} /> Miembros
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  );
}
