import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppSettings } from "@/lib/app-settings";
import type { Gpt } from "@/lib/types";
import { ArrowUpRight, Lock, Sparkles, MessagesSquare, Wand2, ImageIcon } from "lucide-react";
import GptGlyph from "@/components/chat/GptGlyph";

export default async function Landing() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Con sesión, directo al producto
  if (user) redirect("/chat");

  const settings = await getAppSettings();

  const { data: gpts } = await supabase
    .from("gpts_public")
    .select("id, name, description, icon_url, category")
    .order("sort_order", { ascending: true });

  const list =
    (gpts as Pick<Gpt, "id" | "name" | "description" | "icon_url" | "category">[]) ?? [];

  const offerings = [
    {
      n: "01",
      Icon: MessagesSquare,
      title: "Un chat, para ti",
      body: "Tu propio espacio de conversaciones privado, con historial y archivos. Como ChatGPT, pero curado para la comunidad.",
    },
    {
      n: "02",
      Icon: Wand2,
      title: "GPTs con oficio",
      body: "Asistentes afinados para tareas creativas concretas —dirección, guion, imagen— no genéricos de catálogo.",
    },
    {
      n: "03",
      Icon: ImageIcon,
      title: "Imágenes y archivos",
      body: "Sube referencias visuales o documentos y trabaja sobre ellos dentro del mismo hilo, sin salir de la plataforma.",
    },
  ];

  return (
    <div className="grain relative min-h-screen overflow-hidden bg-[var(--background)] text-stone-100">
      {/* Nav */}
      <header className="relative z-20 mx-auto max-w-7xl px-6 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-display text-2xl font-semibold tracking-tight text-stone-50">
              {settings.community_name}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-violet-400/80">
              GPT
            </span>
          </Link>
          <Link
            href="/login"
            className="group inline-flex items-center gap-1.5 rounded-full border border-stone-700/70 bg-stone-900/40 px-4 py-2 text-sm font-medium text-stone-200 backdrop-blur transition-colors hover:border-violet-500/60 hover:text-white"
          >
            Ingresar
            <ArrowUpRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="relative">
          {/* Auroras vivas */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="aurora-a absolute left-1/2 top-[-280px] h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-violet-600/30 blur-[140px]" />
            <div className="aurora-b absolute right-[-160px] top-[20px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-[140px]" />
            <div className="aurora-c absolute left-[-140px] top-[220px] h-[460px] w-[460px] rounded-full bg-amber-500/[0.12] blur-[130px]" />
            {/* Rejilla sutil */}
            <div
              className="absolute inset-0 opacity-[0.14]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
                backgroundSize: "56px 56px",
                maskImage:
                  "radial-gradient(ellipse 80% 55% at 50% 30%, #000 40%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 80% 55% at 50% 30%, #000 40%, transparent 100%)",
              }}
            />
          </div>

          <div className="mx-auto max-w-7xl px-6 pb-24 pt-20 sm:px-10 md:pt-32 lg:px-16">
            <div className="fade-up inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-violet-200 backdrop-blur">
              <Sparkles size={13} className="text-violet-300" />
              Exclusivo · comunidad creativa
            </div>

            <h1
              className="font-display fade-up mt-8 max-w-4xl text-5xl font-medium leading-[0.95] tracking-tight sm:text-7xl md:text-[5.5rem]"
              style={{ animationDelay: "80ms" }}
            >
              <span className="text-gradient">Herramientas de IA</span>
              <br />
              para{" "}
              <span
                className="italic text-fuchsia-300"
                style={{ fontVariationSettings: '"SOFT" 40' }}
              >
                crear
              </span>
              .
            </h1>

            <p
              className="fade-up mt-8 max-w-xl text-lg leading-relaxed text-stone-300/90"
              style={{ animationDelay: "160ms" }}
            >
              Los GPTs de la comunidad, reunidos en un solo lugar. Dirige escenas,
              escribe prompts y trabaja con imágenes desde un chat privado —hecho
              a la medida del flujo creativo.
            </p>

            <div
              className="fade-up mt-11 flex flex-wrap items-center gap-4"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/login"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_8px_30px_-6px_rgba(139,92,246,0.6)] transition-transform hover:scale-[1.03] active:scale-100"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
                Ingresar a la plataforma
                <ArrowUpRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
              <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
                <Lock size={12} className="text-violet-400/70" /> Solo miembros del Skool de{" "}
                {settings.community_name}
              </span>
            </div>
          </div>
        </section>

        {/* Qué ofrece — tarjetas con brillo */}
        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-10 lg:px-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {offerings.map((o, i) => (
              <div
                key={o.n}
                className="ring-gradient group fade-up relative overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40 hover:bg-stone-900/70"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300 transition-colors group-hover:bg-violet-500/20">
                    <o.Icon size={20} />
                  </div>
                  <span className="font-display text-sm text-violet-400/60">{o.n}</span>
                </div>
                <h3 className="font-display text-2xl font-medium tracking-tight text-stone-50">
                  {o.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-400">{o.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* GPTs disponibles — galería */}
        {list.length > 0 && (
          <section className="mx-auto max-w-7xl px-6 pb-28 sm:px-10 lg:px-16">
            <div className="mb-8 flex items-end justify-between">
              <h2 className="font-display text-3xl font-medium tracking-tight text-stone-50">
                En la plataforma
              </h2>
              <span className="rounded-full border border-stone-800 bg-stone-900/50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-violet-300/80">
                {list.length} {list.length === 1 ? "GPT" : "GPTs"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {list.map((g, i) => (
                <div
                  key={g.id}
                  className="ring-gradient group fade-up relative flex items-start gap-5 rounded-2xl border border-stone-800/80 bg-stone-900/30 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-500/40 hover:bg-stone-900/60"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <GptGlyph
                    gpt={g}
                    className="h-14 w-14 rounded-xl ring-1 ring-white/5 transition-transform group-hover:scale-105"
                    sizePx="56px"
                    textClassName="text-2xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-display truncate text-lg font-medium text-stone-50">
                        {g.name}
                      </h3>
                      <span className="flex-shrink-0 text-[10px] uppercase tracking-[0.15em] text-violet-400/60">
                        {g.category}
                      </span>
                    </div>
                    {g.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-stone-400">
                        {g.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="relative z-10 border-t border-stone-800/70 px-6 py-8 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl items-center justify-between text-xs text-stone-500">
          <span className="font-display text-sm text-stone-400">{settings.community_name}</span>
          <span>Acceso privado para la comunidad</span>
        </div>
      </footer>
    </div>
  );
}
