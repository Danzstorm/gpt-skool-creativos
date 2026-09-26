import Link from "next/link";
import { getAppSettings } from "@/lib/app-settings";
import EnergyCanvas from "@/components/ui/EnergyCanvas";
import GptGlyph from "@/components/chat/GptGlyph";
import { createServiceClient } from "@/lib/supabase/server";
import type { Gpt } from "@/lib/types";
import {
  adminBrandAccentClass,
  adminBrandClass,
  adminEyebrowClass,
  adminPrimaryClass,
} from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const reason = str(params.reason) ?? "revoked";

  // Quien llega aquí no es miembro: el catálogo se lee con el cliente de
  // servicio y solo sale lo público (nombre, descripción, categoría).
  const [settings, { data: gptRows }] = await Promise.all([
    getAppSettings(),
    createServiceClient()
      .from("gpts_public")
      .select("id, name, description, category, icon_url")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(5),
  ]);
  const previewGpts = (gptRows ?? []) as Pick<Gpt, "id" | "name" | "description" | "category" | "icon_url">[];

  const used = str(params.used);
  const member = str(params.member);
  const isMismatch = reason === "email_mismatch" && !!used && !!member;
  const expired = reason === "revoked" || reason === "expired";
  const neverMember = reason === "never_member";

  const eyebrow = isMismatch
    ? "ENTRASTE CON OTRA CUENTA"
    : expired
      ? "TU ACCESO ESTÁ EN PAUSA"
      : "ACCESO EXCLUSIVO PARA MIEMBROS";

  const title = isMismatch
    ? "Esa cuenta de Google no es la de tu membresía."
    : expired
      ? "Tus ideas todavía tienen mucho por crear."
      : "Tu próxima gran idea te espera dentro.";

  const description = isMismatch
    ? `Iniciaste sesión como ${used}, pero tu acceso a ${settings.community_name} está a nombre de ${member}. Vuelve a intentar y elige esa cuenta.`
    : expired
      ? `Creativos AI está disponible mientras tu membresía en ${settings.community_name} está activa. Vuelve a la comunidad y retoma tu espacio creativo.`
      : neverMember
        ? `Para entrar a Creativos AI necesitas una membresía activa en ${settings.community_name}. Únete y da el siguiente paso con tus ideas.`
        : `Para entrar a Creativos AI necesitas una membresía activa en ${settings.community_name}. Únete o reactiva tu membresía y da el siguiente paso con tus ideas.`;

  const cta = isMismatch
    ? "Volver a intentar"
    : expired
      ? "Volver a Creativos"
      : "Entrar a Creativos";

  const joinHref = isMismatch ? "/login" : (settings.skool_url ?? "https://www.skool.com/creativos");

  return (
    <div
      className="relative isolate flex min-h-dvh flex-col overflow-hidden px-[6vw] py-8 before:absolute before:inset-0 before:z-[-1] before:bg-[radial-gradient(ellipse_at_70%_40%,#7b205418,transparent_55%),radial-gradient(ellipse_at_90%_90%,#58389712,transparent_50%)] before:content-[''] max-[650px]:p-6"
      id={expired ? "acceso-vencido" : "sin-acceso"}
    >
      <header className="flex items-center justify-between gap-6">
        <Link href="/" className={adminBrandClass}>
          Creativos <span className={adminBrandAccentClass}>AI</span>
        </Link>
        <Link href="/login" className="text-[12px] text-[#91919c] hover:text-[#eeeef2]">
          Cambiar de cuenta ↗
        </Link>
      </header>
      <main className="m-auto grid w-[min(1080px,100%)] grid-cols-[1.1fr_1fr] items-center gap-[9vw] pt-[68px] pb-[76px] max-[900px]:gap-[35px] max-[650px]:grid-cols-1 max-[650px]:gap-[38px] max-[650px]:py-10">
        <section className="animate-[ax-arrive_.65s_cubic-bezier(.22,1,.36,1)_both] motion-reduce:animate-none">
          <div className="relative mb-6 h-16 w-16">
            <EnergyCanvas size={64} speed={0.0025} />
          </div>
          <div className={adminEyebrowClass}>{eyebrow}</div>
          <h1 className="mt-[18px] mb-[22px] font-[family-name:var(--font-display)] text-[clamp(30px,3.1vw,46px)] leading-[1.18] font-normal tracking-[-1.5px]">
            {title}
          </h1>
          <p className="mb-[30px] max-w-[440px] text-sm leading-[1.9] text-[#93939e]">{description}</p>
          {isMismatch ? (
            <Link className={cn(adminPrimaryClass, "text-[13px]")} href="/login">
              {cta} <span>↗</span>
            </Link>
          ) : (
            <a className={cn(adminPrimaryClass, "text-[13px]")} href={joinHref} target="_blank" rel="noopener">
              {cta} <span>↗</span>
            </a>
          )}
          <Link className="mt-[21px] block p-0 text-[12px] text-[#a8a8b2] hover:text-[#eeeef2]" href="/login">
            {neverMember ? "Ya soy miembro · Comprobar acceso" : "Ya renové · Comprobar acceso"}
          </Link>
          <p className="mt-4 text-[11px] text-[#686873]">Usa el mismo correo con el que participas en Skool.</p>
        </section>
        {previewGpts.length > 0 && (
          <aside className="animate-[ax-arrive_.65s_cubic-bezier(.22,1,.36,1)_both] overflow-hidden rounded-[22px] border border-solid border-[#ffffff12] bg-[#101012] shadow-[0_30px_90px_#0004] motion-reduce:animate-none">
            <div className="border-b border-solid border-b-[#ffffff08] px-7 py-[26px] text-[18px] leading-[1.45] tracking-[-0.4px] text-[#eeeef2]">
              Esto es lo que te estás perdiendo
            </div>
            <div className="px-7 py-1">
              {previewGpts.map((gpt) => (
                <div
                  key={gpt.id}
                  className="flex items-center gap-[18px] border-b border-solid border-b-[#ffffff08] py-[21px] last:border-b-0"
                >
                  <GptGlyph
                    gpt={gpt}
                    variant="nav"
                    className="grid h-[46px] w-[46px] flex-[0_0_46px] place-items-center rounded-[14px] bg-[linear-gradient(135deg,#ff682f12,#ff165e15,#7753ff1e)] text-[#d5bbc9] [&_svg]:h-[23px] [&_svg]:w-[23px]"
                  />
                  <div>
                    <h3 className="mb-[7px] text-[15px] font-medium text-[#e4e3e9]">{gpt.name}</h3>
                    {gpt.description && <p className="text-[12px] leading-[1.6] text-[#92929e]">{gpt.description}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-solid border-t-[#ffffff08] bg-[linear-gradient(110deg,#ff682f06,#ff165e07,#7753ff0b)] px-6 py-[23px] text-center">
              <strong className="block text-[13px] font-medium text-[#c8bac8]">Y mucho más dentro de Creativos</strong>
              <span className="mt-2 block text-[11px] text-[#80808d]">Más herramientas para llevar tus ideas más lejos.</span>
            </div>
          </aside>
        )}
      </main>
      <footer className="flex items-center justify-between gap-6 text-[11px] text-[#656570]">
        Creativos AI
        <span className="text-[10px] max-[650px]:max-w-[180px] max-[650px]:text-right">
          Un espacio para quienes hacen que las ideas sucedan.
        </span>
      </footer>
    </div>
  );
}
