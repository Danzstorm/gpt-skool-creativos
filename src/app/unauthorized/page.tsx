import Link from "next/link";
import { getAppSettings } from "@/lib/app-settings";
import EnergyCanvas from "@/components/ui/EnergyCanvas";

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const reason = str(params.reason) ?? "revoked";

  const settings = await getAppSettings();

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
        <Link href="/" className="ax-brand">
          Creativos <span>AI</span>
        </Link>
        <Link href="/login">Cambiar de cuenta ↗</Link>
      </header>
      <main className="m-auto grid w-[min(1080px,100%)] grid-cols-[1.1fr_1fr] items-center gap-[9vw] pt-[68px] pb-[76px] max-[900px]:gap-[35px] max-[650px]:grid-cols-1 max-[650px]:gap-[38px] max-[650px]:py-10">
        <section className="animate-[ax-arrive_.65s_cubic-bezier(.22,1,.36,1)_both] motion-reduce:animate-none">
          <div className="relative mb-6 h-16 w-16">
            <EnergyCanvas size={64} speed={0.0025} />
          </div>
          <div className="ax-eyebrow">{eyebrow}</div>
          <h1 className="mt-[18px] mb-[22px] font-[family-name:var(--font-display)] text-[clamp(30px,3.1vw,46px)] leading-[1.18] font-normal tracking-[-1.5px]">
            {title}
          </h1>
          <p className="mb-[30px] max-w-[440px] text-sm leading-[1.9] text-[#93939e]">{description}</p>
          {isMismatch ? (
            <Link className="ax-primary text-[13px]" href="/login">
              {cta} <span>↗</span>
            </Link>
          ) : (
            <a className="ax-primary text-[13px]" href={joinHref} target="_blank" rel="noopener">
              {cta} <span>↗</span>
            </a>
          )}
          <Link className="mt-[21px] block p-0 text-[12px] text-[#a8a8b2] hover:text-[#eeeef2]" href="/login">
            {neverMember ? "Ya soy miembro · Comprobar acceso" : "Ya renové · Comprobar acceso"}
          </Link>
        </section>
      </main>
    </div>
  );
}
