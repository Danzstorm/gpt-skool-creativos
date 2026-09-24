"use client";

import { useState, useEffect, useSyncExternalStore, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import EnergyCanvas from "@/components/ui/EnergyCanvas";
import AccessMotion from "@/components/ui/AccessMotion";

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

// ! en botón/enlaces: los resets legacy de color, transición y
// svg{stroke-width} siguen vivos y ganan a las utilidades.
// Grano del fondo (antes .access-home:after de la plantilla).
const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' filter='url(%23n)' opacity='.5' d='M0 0h180v180H0z'/%3E%3C/svg%3E\")";
const NOTES = "access-notes mx-auto mt-[10px] flex w-[min(100%,340px)] flex-col gap-[5px] text-center max-[600px]:max-w-[310px]";
const HINT = "access-hint m-0 leading-[1.6] text-[#7f7f89] [text-wrap:balance]";

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
  const inAppBrowser = useSyncExternalStore(
    noSubscribe,
    () => IN_APP_BROWSER.test(navigator.userAgent),
    () => false
  );
  const [communityName, setCommunityName] = useState("Creativos");
  const [skoolUrl, setSkoolUrl] = useState(process.env.NEXT_PUBLIC_SKOOL_URL || "https://www.skool.com/creativos");

  const [showUrlError, setShowUrlError] = useState(true);
  const urlError = showUrlError && errorCode ? ERROR_COPY[errorCode] ?? FALLBACK_ERROR : null;
  const notice =
    status === "error"
      ? { title: "No se pudo iniciar con Google", body: "Vuelve a intentarlo en unos segundos." }
      : urlError;

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
    <section className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#060607] px-12 py-[30px] font-['Plus_Jakarta_Sans',sans-serif] text-[#eeeef2] max-[600px]:p-6">
      <AccessMotion />
      <main className="access-main mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center pt-12 pb-16 text-center max-[600px]:py-10">
        <div className="flex items-center justify-center gap-1 [transform:translateX(-6px)] max-[600px]:gap-[3px] max-[600px]:[transform:translateX(-3px)]">
          {/* ! porque .brand-energy (legacy) fija 82px y margen. */}
          <div className="brand-energy relative !m-0 !h-[72px] !w-[72px] shrink-0 max-[600px]:!h-[54px] max-[600px]:!w-[54px]">
            <EnergyCanvas size={82} speed={0.0025} />
          </div>
          <h1 className="m-0 bg-[linear-gradient(110deg,#fff_20%,#eee9f5_48%,#ab94c7_85%)] bg-clip-text font-['Plus_Jakarta_Sans',sans-serif] text-[clamp(36px,4.5vw,56px)] leading-[1.18] font-normal tracking-[-1.7px] text-[#f2edf8] [-webkit-text-fill-color:transparent] [text-shadow:0_0_12px_#ffffff50,0_0_30px_#ffffff29,0_0_58px_#ffffff14] max-[600px]:tracking-[-1.2px]">Creativos AI</h1>
        </div>
        <p className="access-description mx-auto mt-[10px] mb-[26px] max-w-[520px] leading-[1.65] [overflow-wrap:anywhere] text-[#92929c] max-[600px]:mb-6 max-[600px]:max-w-[310px]">
          Plataforma exclusiva para miembros de{" "}
          <a
            href={skoolUrl}
            target="_blank"
            rel="noopener"
            className="relative inline-block text-inherit no-underline underline-offset-4 ![transition:color_.2s_ease] after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(110deg,#ffbd16_0%,#ff682f_22%,#ff165e_46%,#ee0de4_73%,#7753ff_100%)] after:bg-clip-text after:text-transparent after:opacity-0 after:transition-opacity after:duration-300 after:ease-[ease] after:content-['Creativos'] hover:text-transparent hover:after:opacity-100 focus-visible:text-transparent focus-visible:after:opacity-100"
          >
            {communityName}
          </a>
        </p>
        <div className="w-[min(100%,290px)] rounded-[20px]">
          {notice && (
            <div role="alert" className={NOTES} style={{ marginBottom: 16 }}>
              <p className={HINT}>
                <strong>{notice.title}</strong>
                <br />
                {notice.body}
              </p>
            </div>
          )}
          {inAppBrowser && (
            <div className={NOTES} style={{ marginBottom: 16 }}>
              <p className={HINT}>
                Google no permite iniciar sesión desde el navegador de Instagram, Facebook o TikTok.
                Toca el menú (⋯) y elige «Abrir en el navegador».
              </p>
            </div>
          )}
          <button
            type="button"
            id="accessContinue"
            onClick={handleGoogle}
            disabled={loading}
            className="flex min-h-11 w-full items-center justify-center gap-[10px] rounded-[10px] border-0 bg-[#eeeef2] font-normal !text-[#151518] ![transition:background_.2s,transform_.2s] hover:bg-white active:scale-[.98]"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] fill-none stroke-none ![stroke-width:0]">
              <path d="M20 12.2c0-.6 0-1.1-.2-1.7H12v3.3h4.5a4 4 0 0 1-1.7 2.6v2.2h2.8c1.6-1.5 2.4-3.7 2.4-6.4Z" fill="#4285f4" stroke="none" />
              <path d="M12 20c2.3 0 4.2-.8 5.6-2.1l-2.8-2.2c-.8.5-1.7.8-2.8.8-2.2 0-4.1-1.5-4.8-3.5H4.3v2.3A8.5 8.5 0 0 0 12 20Z" fill="#34a853" stroke="none" />
              <path d="M7.2 13a5 5 0 0 1 0-3V7.7H4.3a8.5 8.5 0 0 0 0 7.6Z" fill="#fbbc05" stroke="none" />
              <path d="M12 6.5c1.2 0 2.3.4 3.2 1.2l2.4-2.4A8 8 0 0 0 12 3a8.5 8.5 0 0 0-7.7 4.7L7.2 10c.7-2 2.6-3.5 4.8-3.5Z" fill="#ea4335" stroke="none" />
            </svg>
            {loading ? "Conectando con Google…" : "Continuar con Google"}
          </button>
        </div>
        <div className={NOTES}>
          <p className={HINT}>Accede con el mismo correo que usas en Skool</p>
        </div>
      </main>
      <footer className="flex items-center justify-between text-[9px] tracking-[1.5px] text-[#55555d]">
        <span className="tracking-normal max-[600px]:hidden">Acceso solo para miembros. No hay registro abierto.</span>
        <Link href="/">Creativos AI</Link>
      </footer>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1] bg-[length:120px_120px] opacity-[.085] mix-blend-soft-light"
        style={{ backgroundImage: NOISE_BG }}
      />
    </section>
  );
}
