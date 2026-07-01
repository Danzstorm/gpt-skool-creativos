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
      <header className="border-b border-gray-800 bg-gray-950 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-sm">
                ✦
              </div>
              <span className="font-semibold text-white">GPT Creativos</span>
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-purple-400 text-sm font-medium">Admin</span>
          </div>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-gray-400 hover:text-white transition flex items-center gap-1.5">
              <LayoutDashboard size={15} /> Dashboard
            </Link>
            <Link href="/admin/gpts" className="text-gray-400 hover:text-white transition flex items-center gap-1.5">
              <Bot size={15} /> GPTs
            </Link>
            <Link href="/admin/members" className="text-gray-400 hover:text-white transition flex items-center gap-1.5">
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
