import Link from "next/link";

export default function UnauthorizedPage() {
  const skoolUrl = process.env.NEXT_PUBLIC_SKOOL_URL || "https://www.skool.com/";

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-stone-100">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-160px] -z-0 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-violet-600/12 blur-[150px]"
      />
      <div className="relative z-10 max-w-sm text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="font-display mb-3 text-2xl font-medium tracking-tight text-stone-50">
          Acceso solo para miembros
        </h1>
        <p className="mb-7 text-sm leading-relaxed text-stone-400">
          Esta plataforma es exclusiva para miembros activos del Skool de Creativos. Si dejaste de
          ser miembro o tu suscripción venció, únete o renueva para recuperar el acceso.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href={skoolUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-full bg-stone-50 px-6 py-3 font-semibold text-stone-950 transition-transform hover:scale-[1.02]"
          >
            Unirme / renovar en Skool
          </a>
          <Link
            href="/login"
            className="inline-block py-2 text-sm text-stone-400 transition hover:text-white"
          >
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
