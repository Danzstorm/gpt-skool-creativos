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
    <div className="ax-gate" id={expired ? "acceso-vencido" : "sin-acceso"}>
      <header>
        <Link href="/" className="ax-brand">
          Creativos <span>AI</span>
        </Link>
        <Link href="/login">Cambiar de cuenta ↗</Link>
      </header>
      <main className="ax-gate-main">
        <section className="ax-gate-copy">
          <div className="ax-gate-energy">
            <EnergyCanvas size={64} speed={0.0025} />
          </div>
          <div className="ax-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p className="ax-gate-description">{description}</p>
          {isMismatch ? (
            <Link className="ax-primary ax-join" href="/login">
              {cta} <span>↗</span>
            </Link>
          ) : (
            <a className="ax-primary ax-join" href={joinHref} target="_blank" rel="noopener">
              {cta} <span>↗</span>
            </a>
          )}
          <Link className="ax-recheck" href="/login">
            {neverMember ? "Ya soy miembro · Comprobar acceso" : "Ya renové · Comprobar acceso"}
          </Link>
        </section>
      </main>
    </div>
  );
}
