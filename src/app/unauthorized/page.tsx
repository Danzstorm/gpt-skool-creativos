import Link from "next/link";

export default function UnauthorizedPage() {
  const skoolUrl = process.env.NEXT_PUBLIC_SKOOL_URL || "https://www.skool.com/";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Acceso solo para miembros</h1>
        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          Esta plataforma es exclusiva para miembros activos del Skool de Creativos. Si dejaste de
          ser miembro o tu suscripción venció, únete o renueva para recuperar el acceso.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href={skoolUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-gradient-to-br from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white font-semibold rounded-xl px-6 py-3 transition shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
          >
            Unirme / renovar en Skool
          </a>
          <Link
            href="/login"
            className="inline-block text-zinc-400 hover:text-white text-sm py-2 transition"
          >
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
