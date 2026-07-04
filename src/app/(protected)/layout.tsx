import { createClient } from "@/lib/supabase/server";
import { isAllowedMember } from "@/lib/membership";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut, LayoutGrid, MessagesSquare } from "lucide-react";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Defensa: si el usuario fue removido de la lista, cerrar sesión.
  if (!(await isAllowedMember(user.email))) {
    await supabase.auth.signOut();
    redirect("/unauthorized");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_admin")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/chat" className="group flex items-baseline gap-2">
            <span className="font-display text-xl font-semibold tracking-tight text-stone-50">
              Creativos
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone-500">
              GPT
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/chat"
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg px-3 py-1.5 transition text-sm flex items-center gap-1.5"
            >
              <MessagesSquare size={16} />
              Chat
            </Link>
            <Link
              href="/dashboard"
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg px-3 py-1.5 transition text-sm flex items-center gap-1.5"
            >
              <LayoutGrid size={16} />
              Catálogo
            </Link>
            {profile?.is_admin && (
              <Link
                href="/admin"
                className="text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg px-3 py-1.5 transition text-sm border border-amber-500/20"
              >
                Admin
              </Link>
            )}
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg px-3 py-1.5 transition text-sm flex items-center gap-1.5"
              >
                <LogOut size={16} />
                Salir
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
