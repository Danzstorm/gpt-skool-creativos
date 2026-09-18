import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAppSettings } from "@/lib/app-settings";
import type { Gpt } from "@/lib/types";
import { ArrowUpRight } from "lucide-react";
import GptGlyph from "@/components/chat/GptGlyph";

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
        icon: "🔑",
        title: "Entraste con otra cuenta",
        body: null,
      }
    : reason === "never_member"
      ? {
          icon: "🚪",
          title: "Tu correo no está en la lista",
          body: `No encontramos tu correo entre los miembros de ${settings.community_name}. Si acabas de unirte, puede tardar unos minutos en aparecer — vuelve a intentar en un rato.`,
        }
      : {
          icon: "⏸️",
          title: "Tu acceso está en pausa",
          body: `Tu membresía del Skool de ${settings.community_name} ya no está activa — quizás venció o se canceló. Nada se borró: tus conversaciones y todo lo que tenías siguen ahí, esperando a que vuelvas.`,
        };

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-16 text-stone-100">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-160px] -z-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-violet-600/12 blur-[150px]"
      />
      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="mb-4 text-5xl">{copy.icon}</div>
        <h1 className="font-display mb-3 text-2xl font-medium tracking-tight text-stone-50">
          {copy.title}
        </h1>

        {copy.body && (
          <p className="mb-6 text-sm leading-relaxed text-stone-400">{copy.body}</p>
        )}

        {isMismatch && (
          <div className="mb-6 space-y-3 text-sm leading-relaxed text-stone-400">
            <p>
              Iniciaste sesión como{" "}
              <span className="font-medium text-stone-200">{used}</span>, pero tu acceso a{" "}
              {settings.community_name} está a nombre de{" "}
              <span className="font-medium text-violet-300">{member}</span>.
            </p>
            <p>
              Vuelve a intentar y, en el selector de Google, elige la cuenta de ese correo.
            </p>
          </div>
        )}

        {list.length > 0 && !isMismatch && (
          <div className="mb-7 rounded-2xl border border-stone-800/80 bg-stone-900/40 p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-violet-400/70">
              Esto es lo que te estás perdiendo
            </p>
            <div className="flex flex-col gap-2 text-left">
              {list.map((g) => (
                <div key={g.id} className="flex items-center gap-2.5">
                  <GptGlyph gpt={g} size="sm" />
                  <span className="truncate text-sm text-stone-300">{g.name}</span>
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
            className="inline-flex items-center justify-center rounded-full bg-stone-50 px-6 py-3 font-semibold text-stone-950 transition-transform hover:scale-[1.02]"
          >
            Volver a intentar
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <a
              href={settings.skool_url ?? "https://www.skool.com/"}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center justify-center gap-1.5 rounded-full bg-stone-50 px-6 py-3 font-semibold text-stone-950 transition-transform hover:scale-[1.02]"
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
              className="inline-block py-2 text-sm text-stone-400 transition hover:text-white"
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
