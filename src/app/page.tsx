import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Gpt } from "@/lib/types";
import { MessageSquare, ImageIcon, Sparkles, Lock } from "lucide-react";

export default async function Landing() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Con sesión, directo al producto
  if (user) redirect("/chat");

  const { data: gpts } = await supabase
    .from("gpts_public")
    .select("id, name, description, icon_url, category")
    .order("sort_order", { ascending: true });

  const list = (gpts as Pick<Gpt, "id" | "name" | "description" | "icon_url" | "category">[]) ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-800/70 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-violet-700 rounded-lg flex items-center justify-center text-sm shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]">
              ✦
            </div>
            <span className="font-semibold text-zinc-100 tracking-tight">GPT Creativos</span>
          </div>
          <Link
            href="/login"
            className="bg-gradient-to-br from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white text-sm font-semibold rounded-xl px-4 py-2 transition shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
          >
            Ingresar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 mb-6">
            <Sparkles size={13} /> Exclusivo para la comunidad
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-zinc-100 tracking-tight leading-[1.05] max-w-3xl mx-auto">
            Los GPTs de Creativos, en un solo lugar
          </h1>
          <p className="text-zinc-400 mt-5 text-lg max-w-xl mx-auto leading-relaxed">
            Herramientas de IA entrenadas para el flujo creativo de la comunidad: genera prompts,
            dirige escenas y trabaja con imágenes. Todo desde un chat privado.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="bg-gradient-to-br from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white font-semibold rounded-xl px-6 py-3 transition shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
            >
              Ingresar
            </Link>
          </div>
          <p className="text-zinc-600 text-xs mt-4 flex items-center justify-center gap-1.5">
            <Lock size={12} /> Acceso solo para miembros del Skool de Creativos
          </p>
        </section>

        {/* Qué ofrece */}
        <section className="max-w-5xl mx-auto px-4 pb-16 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: MessageSquare, title: "Chat privado", body: "Cada miembro tiene su propio espacio de conversaciones, como ChatGPT." },
            { icon: Sparkles, title: "GPTs a medida", body: "Asistentes configurados para tareas creativas concretas, no genéricos." },
            { icon: ImageIcon, title: "Imágenes y archivos", body: "Sube referencias visuales o documentos y trabaja sobre ellos." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
              <Icon size={20} className="text-violet-400 mb-3" />
              <h3 className="text-zinc-100 font-semibold">{title}</h3>
              <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{body}</p>
            </div>
          ))}
        </section>

        {/* GPTs disponibles */}
        {list.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 pb-24">
            <h2 className="text-zinc-300 text-sm font-medium mb-4 text-center">
              GPTs disponibles en la plataforma
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {list.map((g) => (
                <div key={g.id} className="flex items-start gap-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/20 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                    {g.icon_url ? <img src={g.icon_url} alt="" className="w-full h-full object-cover" /> : "✦"}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-zinc-100 font-semibold truncate">{g.name}</h3>
                    {g.description && (
                      <p className="text-zinc-400 text-sm mt-1 line-clamp-2 leading-relaxed">{g.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-zinc-800/70 px-4 py-6 text-center text-zinc-600 text-xs">
        GPT Creativos — acceso privado para la comunidad
      </footer>
    </div>
  );
}
