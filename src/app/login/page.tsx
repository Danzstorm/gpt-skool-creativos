"use client";

import { useState, useEffect, useSyncExternalStore, use } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Aurora from "@/components/ui/Aurora";
import Orb from "@/components/ui/Orb";

// Google es la única forma de entrar. El magic link se retiró porque a mucha
// gente no le llegaba o abría el enlace en otro navegador y no funcionaba.
//
// Cada motivo por el que se puede acabar de vuelta acá, con su explicación y el
// paso siguiente. Sin esto un rechazo, una sesión caducada y un fallo de Google
// se ven todos igual: la pantalla de login en blanco, sin una palabra.
const ERROR_COPY: Record<string, { title: string; body: string }> = {
  cancelled: {
    title: "Cancelaste el acceso con Google",
    body: "Cuando quieras, vuelve a intentarlo.",
  },
  other_browser: {
    title: "Termina el acceso en el mismo navegador",
    body: "El inicio de sesión empezó en otro navegador o pestaña. Vuelve a pulsar «Continuar con Google» desde aquí.",
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
    body: "Algo se interrumpió en el camino. Vuelve a intentarlo con Google.",
  },
};

const FALLBACK_ERROR = {
  title: "No pudimos completar el acceso",
  body: "Intenta de nuevo. Si vuelve a pasar, escríbenos.",
};

// Google rechaza el OAuth dentro de los navegadores embebidos (Instagram,
// Facebook, TikTok…) con "403 disallowed_useragent". Como es la única forma de
// entrar, hay que avisarlo ANTES del clic, no después con un error de Google.
const IN_APP_BROWSER = /FBAN|FBAV|Instagram|TikTok|Snapchat|Line\/|; wv\)/i;
const noSubscribe = () => () => {};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = use(searchParams);
  const errorCode = typeof params.error === "string" ? params.error : null;

  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  // El user agent solo existe en el navegador; en el servidor se asume que no.
  const inAppBrowser = useSyncExternalStore(
    noSubscribe,
    () => IN_APP_BROWSER.test(navigator.userAgent),
    () => false
  );
  const [communityName, setCommunityName] = useState("Creativos");
  const [skoolUrl, setSkoolUrl] = useState(process.env.NEXT_PUBLIC_SKOOL_URL || "https://www.skool.com/");

  // El aviso del ?error= se descarta en cuanto la persona vuelve a intentar, para
  // no dejar dos mensajes contradictorios en pantalla a la vez.
  const [showUrlError, setShowUrlError] = useState(true);
  const urlError = showUrlError && errorCode ? ERROR_COPY[errorCode] ?? FALLBACK_ERROR : null;
  const notice =
    status === "error"
      ? { title: "No se pudo iniciar con Google", body: "Vuelve a intentarlo en unos segundos." }
      : urlError;

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

  // Si la persona vuelve con "atrás" desde Google, el navegador restaura la
  // página desde caché con el botón aún en "Conectando…". Se destraba acá.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setStatus("idle");
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function handleGoogle() {
    setStatus("loading");
    setShowUrlError(false);
    const supabase = createClient();
    // El gate (auth/callback) valida contra allowed_members tras el login.
    // `select_account` obliga a Google a mostrar el selector de cuentas: sin
    // él, quien entró con el Google equivocado queda en bucle porque Google
    // reutiliza la misma cuenta en cada intento.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setStatus("error");
  }

  const loading = status === "loading";

  return (
    // `isolate` crea stacking context: sin él Aurora (-z-10) quedaría detrás
    // del fondo del root y no se vería.
    <div className="grain relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[var(--background)] px-4 text-zinc-100">
      <Aurora />
      <div className="glass-strong relative z-10 w-full max-w-sm rounded-3xl p-8">
        <div className="mb-9 text-center">
          <Orb size="md" className="mx-auto mb-6" />
          <Link href="/" className="inline-flex items-baseline gap-2">
            <span className="font-display wordmark brand-text text-3xl font-extrabold uppercase italic tracking-tight">
              {communityName}
            </span>
            <span className="eyebrow text-zinc-500">GPT</span>
          </Link>
          <p className="mt-3 text-sm text-zinc-400">
            Acceso exclusivo para la comunidad
          </p>
        </div>

        <div className="space-y-4">
          {notice && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
            >
              <p className="font-medium">{notice.title}</p>
              <p className="mt-1 leading-relaxed text-amber-200/70">{notice.body}</p>
            </div>
          )}

          {inAppBrowser && (
            <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-zinc-200">
              <p className="font-medium">Abre esta página en tu navegador</p>
              <p className="mt-1 leading-relaxed text-zinc-400">
                Google no permite iniciar sesión desde el navegador de Instagram, Facebook o
                TikTok. Toca el menú (⋯) y elige «Abrir en el navegador», o copia el enlace en
                Chrome o Safari.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-zinc-50 px-4 py-3.5 text-base font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin text-zinc-500" aria-hidden />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {loading ? "Conectando con Google…" : "Continuar con Google"}
          </button>

          {/* Ataca en la fuente el rechazo por email distinto: mucha gente
              tiene su Google personal y su Skool a otro nombre. */}
          <p className="text-center text-sm leading-relaxed text-zinc-400">
            Elige la cuenta de Google con el <span className="text-zinc-200">mismo correo</span> que
            usas en Skool {communityName}.
          </p>

          <div className="border-t border-white/8 pt-4 text-center text-xs leading-relaxed text-zinc-500">
            <p>Acceso solo para miembros. No hay registro abierto.</p>
            <a
              href={skoolUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-zinc-300 underline underline-offset-4 transition hover:text-zinc-100"
            >
              ¿Todavía no eres miembro? Unirme a {communityName}
              <ArrowUpRight size={12} aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
