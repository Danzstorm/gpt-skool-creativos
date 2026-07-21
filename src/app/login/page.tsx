"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// El botón de Google solo aparece si el provider está realmente configurado en
// Supabase Auth. Sin credenciales de Google Cloud, signInWithOAuth falla y el
// usuario ve un error sin salida — mejor no ofrecer la opción.
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

// Cada motivo por el que se puede acabar de vuelta acá, con su explicación y el
// paso siguiente. Antes /login ignoraba el ?error= que le mandaba el callback,
// así que un enlace vencido, una sesión caducada y un rechazo de acceso se veían
// todos igual: la pantalla de login en blanco, sin una palabra.
const ERROR_COPY: Record<string, { title: string; body: string }> = {
  link_expired: {
    title: "Ese enlace ya no sirve",
    body: "Los enlaces de acceso duran 1 hora y funcionan una sola vez. Pide uno nuevo abajo.",
  },
  link_other_browser: {
    title: "Abre el enlace en el mismo navegador",
    body: "Pediste el acceso desde otro navegador o dispositivo. Pide uno nuevo desde aquí y ábrelo en esta misma ventana.",
  },
  session_expired: {
    title: "Tu sesión caducó",
    body: "Por seguridad cerramos las sesiones inactivas. Vuelve a entrar y sigues donde estabas.",
  },
  temporary: {
    title: "No pudimos verificar tu acceso",
    body: "Fue un problema nuestro, no tuyo — tu membresía está intacta. Intenta de nuevo en un minuto.",
  },
  auth_failed: {
    title: "No pudimos completar el acceso",
    body: "Algo se interrumpió en el camino. Intenta de nuevo con tu correo.",
  },
};

const FALLBACK_ERROR = {
  title: "No pudimos completar el acceso",
  body: "Intenta de nuevo. Si vuelve a pasar, escríbenos.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = use(searchParams);
  const errorCode = typeof params.error === "string" ? params.error : null;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [communityName, setCommunityName] = useState("Creativos");
  const [skoolUrl, setSkoolUrl] = useState(process.env.NEXT_PUBLIC_SKOOL_URL || "https://www.skool.com/");

  // El aviso del ?error= se descarta en cuanto la persona vuelve a intentar, para
  // no dejar dos mensajes contradictorios en pantalla a la vez.
  const [showUrlError, setShowUrlError] = useState(true);
  const urlError = showUrlError && errorCode ? ERROR_COPY[errorCode] ?? FALLBACK_ERROR : null;

  // Marca (white-label) vía RLS pública de app_settings — sin esto cada cliente
  // nuevo requeriría tocar código para su nombre/comunidad.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("app_settings")
        .select("community_name, skool_url")
        .eq("id", 1)
        .single();
      if (data?.community_name) setCommunityName(data.community_name);
      if (data?.skool_url) setSkoolUrl(data.skool_url);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    setShowUrlError(false);

    const res = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase().trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setErrorMsg(data.error || "No tienes acceso a esta plataforma.");
      setStatus("error");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMsg("Error al enviar el correo. Intenta de nuevo.");
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  async function handleGoogle() {
    setErrorMsg("");
    setShowUrlError(false);
    const supabase = createClient();
    // El gate (auth/callback) valida contra allowed_members tras el login.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErrorMsg("No se pudo iniciar con Google. Intenta de nuevo.");
      setStatus("error");
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-stone-100">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-160px] -z-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[150px]"
      />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-9 text-center">
          <Link href="/" className="inline-flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold tracking-tight text-stone-50">
              {communityName}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone-500">
              GPT
            </span>
          </Link>
          <p className="mt-3 text-sm text-stone-400">
            Acceso exclusivo para la comunidad
          </p>
        </div>

        {status === "sent" ? (
          <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-7 text-center">
            <div className="mb-3 text-3xl">📧</div>
            <h2 className="font-display mb-2 text-xl font-medium text-stone-50">Revisa tu correo</h2>
            <p className="text-sm leading-relaxed text-stone-400">
              Te enviamos un enlace de acceso a{" "}
              <span className="text-violet-300">{email}</span>. El enlace expira
              en 1 hora y sirve una sola vez.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-stone-500">
              Ábrelo en este mismo navegador. Si no llega en unos minutos, revisa spam.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {urlError && (
              <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm">
                <p className="font-medium text-amber-200">{urlError.title}</p>
                <p className="mt-1 leading-relaxed text-amber-200/70">{urlError.body}</p>
              </div>
            )}

            {GOOGLE_ENABLED && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="w-full flex items-center justify-center gap-2.5 bg-stone-50 hover:bg-white text-stone-800 font-semibold rounded-xl px-4 py-3 transition active:scale-[0.99]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continuar con Google
                </button>

                {/* Ataca en la fuente el rechazo por email distinto: mucha gente
                    tiene su Google personal y su Skool a otro nombre. */}
                <p className="text-center text-xs text-stone-500">
                  Usa la cuenta con el mismo correo que tienes en {communityName}.
                </p>

                <div className="flex items-center gap-3 text-xs text-stone-600">
                  <div className="flex-1 h-px bg-stone-800" />
                  o con tu correo
                  <div className="flex-1 h-px bg-stone-800" />
                </div>
              </>
            )}

            {status === "error" && (
              <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-red-300 text-sm">
                {errorMsg}
                {errorMsg.toLowerCase().includes("acceso") && (
                  <a
                    href={skoolUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-2 text-violet-300 underline"
                  >
                    Unirme al Skool de {communityName} →
                  </a>
                )}
              </div>
            )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-stone-300 mb-1.5"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full bg-stone-900/60 border border-stone-700 rounded-xl px-4 py-3 text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading" || !email}
              className="w-full bg-stone-50 hover:bg-white text-stone-950 font-semibold rounded-xl px-4 py-3 transition active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Verificando..." : "Enviar enlace de acceso"}
            </button>

            <p className="text-center text-xs text-stone-500">
              Acceso solo para miembros de{" "}
              <span className="text-stone-400">Skool {communityName}</span>. No hay registro abierto.
            </p>
          </form>
          </div>
        )}
      </div>
    </div>
  );
}
