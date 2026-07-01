import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-white mb-2">Acceso denegado</h1>
        <p className="text-gray-400 text-sm mb-6">
          Esta plataforma es exclusiva para miembros de Skool Creativos.
        </p>
        <Link
          href="/login"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl px-6 py-3 transition"
        >
          Volver al login
        </Link>
      </div>
    </div>
  );
}
