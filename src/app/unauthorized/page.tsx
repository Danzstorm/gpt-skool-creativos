import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppSettings } from "@/lib/app-settings";
import type { Gpt } from "@/lib/types";
import { ArrowUpRight, CirclePause, DoorOpen, KeyRound } from "lucide-react";
import GptGlyph from "@/components/chat/GptGlyph";
import Aurora from "@/components/ui/Aurora";

// Se llega acá recién des-logueado (el gate ya cerró la sesión antes del
// redirect), así que esta consulta corre como anon — misma policy RLS que la
// landing pública. Mostrar lo que se pierde (con nombres reales) es más
// persuasivo y honesto que un genérico "no tienes acceso".
//
// El `reason` lo pone quien rechaza (auth/callback o el proxy). Sin él, esta
// página afirmaba SIEMPRE que la membresía había vencido — falso y desconcertante
// para quien nunca fue miembro, o para quien entró con el Google equivocado.
export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const reason = str(params.reason) ?? "revoked";

  const settings = await getAppSettings();
  const supabase = await createClient();
  const { data: gpts } = await supabase
    .from("gpts_public")
    .select("id, name, icon_url, category")
    .order("sort_order", { ascending: true })
    .limit(4);

  const list = (gpts as Pick<Gpt, "id" | "name" | "icon_url" | "category">[]) ?? [];

  // Los emails llegan ya enmascarados desde el callback: esta página es pública,
  // y mostrarlos enteros la convertiría en un oráculo de quién es miembro.
  const used = str(params.used);
  const member = str(params.member);
  const isMismatch = reason === "email_mismatch" && !!used && !!member;

  const copy = isMismatch
    ? {
        icon: KeyRound,
        title: "Entraste con otra cuenta",
        body: null,
      }
    : reason === "never_member"
      ? {
          icon: DoorOpen,
          title: "Tu correo no está en la lista",
          body: `No encontramos tu correo entre los miembros de ${settings.community_name}. Si acabas de unirte, puede tardar unos minutos en aparecer — vuelve a intentar en un rato.`,
        }
      : {
          icon: CirclePause,
          title: "Tu acceso está en pausa",
          body: `Tu membresía del Skool de ${settings.community_name} ya no está activa — quizás venció o se canceló. Nada se borró: tus conversaciones y todo lo que tenías siguen ahí, esperando a que vuelvas.`,
        };
  const Icon = copy.icon;

  return (
    // `isolate` crea stacking context: sin él Aurora (-z-10) quedaría detrás
    // del fondo del root y no se vería.
    <div className="grain relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[var(--background)] px-4 py-16 text-zinc-100">
      <Aurora />
      <div className="glass-strong relative z-10 w-full max-w-sm rounded-3xl p-8 text-center">
        <div className="glass mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl">
          <Icon size={28} className="text-brand-pink" aria-hidden />
        </div>
        <h1 className="font-display mb-3 text-2xl font-semibold tracking-tight text-zinc-50">
          {copy.title}
        </h1>

        {copy.body && (
          <p className="mb-6 text-sm leading-relaxed text-zinc-400">{copy.body}</p>
        )}

        {isMismatch && (
          <div className="mb-6 space-y-3 text-sm leading-relaxed text-zinc-400">
            <p>
              Iniciaste sesión como{" "}
              <span className="font-medium text-zinc-200">{used}</span>, pero tu acceso a{" "}
              {settings.community_name} está a nombre de{" "}
              <span className="font-medium text-brand-pink">{member}</span>.
            </p>
            <p>
              Vuelve a intentar y, en el selector de Google, elige la cuenta de ese correo.
            </p>
          </div>
        )}

        {list.length > 0 && !isMismatch && (
          <div className="mb-7">
            <p className="eyebrow mb-3 text-zinc-500">Esto es lo que te estás perdiendo</p>
            <div className="flex flex-col gap-2 text-left">
              {list.map((g, i) => (
                <div
                  key={g.id}
                  className="fade-up flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.06] px-3 py-2"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <GptGlyph gpt={g} size="sm" />
                  <span className="truncate text-sm text-zinc-100">{g.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* En el mismatch la acción correcta es reintentar el login, no ir a
            Skool: la persona YA es miembro, solo entró con la cuenta equivocada. */}
        {isMismatch ? (
          <Link
            href="/login"
            className="cta-gradient inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-2.5 font-medium text-white transition hover:brightness-110"
          >
            Volver a intentar
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <a
              href={settings.skool_url ?? "https://www.skool.com/"}
              target="_blank"
              rel="noreferrer"
              className="cta-gradient group inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 font-medium text-white transition hover:brightness-110"
            >
              {reason === "never_member"
                ? `Unirme a ${settings.community_name}`
                : `Volver a entrar a ${settings.community_name}`}
              <ArrowUpRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
            <Link
              href="/login"
              className="inline-block py-2 text-sm text-zinc-400 transition hover:text-white"
            >
              {reason === "never_member"
                ? "Probar con otro correo"
                : "Ya renové, volver al inicio de sesión"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
