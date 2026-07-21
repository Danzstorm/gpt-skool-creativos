import { createClient } from "@/lib/supabase/server";
import { getAppSettings } from "@/lib/app-settings";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Bot, LayoutDashboard, Settings } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // maybeSingle y no single: si el perfil todavía no existe, `single()` devuelve
  // un error PGRST116 que aquí se descartaba en silencio, colapsando dos casos
  // distintos —"no eres admin" y "tu perfil aún no se creó"— en el mismo
  // redirect mudo a /dashboard.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/dashboard?notice=profile_pending");
  if (!profile.is_admin) redirect("/dashboard?notice=not_admin");

  const settings = await getAppSettings();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-baseline gap-2">
              <span className="font-display text-xl font-semibold tracking-tight text-stone-50">
                {settings.community_name}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone-500">
                GPT
              </span>
            </Link>
            <span className="text-stone-600">/</span>
            <span className="text-sm font-medium text-amber-400/90">Admin</span>
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
            <Link href="/admin/settings" className="text-zinc-400 hover:text-white transition flex items-center gap-1.5">
              <Settings size={15} /> Ajustes
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
