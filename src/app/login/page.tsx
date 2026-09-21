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
    <section className="access-home">
      <AccessMotion />
      <main className="access-main">
        <div className="access-title-row">
          <div className="access-energy brand-energy">
            <EnergyCanvas size={82} speed={0.0025} />
          </div>
          <h1>Creativos AI</h1>
        </div>
        <p className="access-description">
          Plataforma exclusiva para miembros de{" "}
          <a href={skoolUrl} target="_blank" rel="noopener">
            {communityName}
          </a>
        </p>
        <div className="access-card">
          {notice && (
            <div role="alert" className="access-notes" style={{ marginBottom: 16 }}>
              <p className="access-hint">
                <strong>{notice.title}</strong>
                <br />
                {notice.body}
              </p>
            </div>
          )}
          {inAppBrowser && (
            <div className="access-notes" style={{ marginBottom: 16 }}>
              <p className="access-hint">
                Google no permite iniciar sesión desde el navegador de Instagram, Facebook o TikTok.
                Toca el menú (⋯) y elige «Abrir en el navegador».
              </p>
            </div>
          )}
          <button type="button" id="accessContinue" onClick={handleGoogle} disabled={loading}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M20 12.2c0-.6 0-1.1-.2-1.7H12v3.3h4.5a4 4 0 0 1-1.7 2.6v2.2h2.8c1.6-1.5 2.4-3.7 2.4-6.4Z" fill="#4285f4" stroke="none" />
              <path d="M12 20c2.3 0 4.2-.8 5.6-2.1l-2.8-2.2c-.8.5-1.7.8-2.8.8-2.2 0-4.1-1.5-4.8-3.5H4.3v2.3A8.5 8.5 0 0 0 12 20Z" fill="#34a853" stroke="none" />
              <path d="M7.2 13a5 5 0 0 1 0-3V7.7H4.3a8.5 8.5 0 0 0 0 7.6Z" fill="#fbbc05" stroke="none" />
              <path d="M12 6.5c1.2 0 2.3.4 3.2 1.2l2.4-2.4A8 8 0 0 0 12 3a8.5 8.5 0 0 0-7.7 4.7L7.2 10c.7-2 2.6-3.5 4.8-3.5Z" fill="#ea4335" stroke="none" />
            </svg>
            {loading ? "Conectando con Google…" : "Continuar con Google"}
          </button>
        </div>
        <div className="access-notes">
          <p className="access-hint">Accede con el mismo correo que usas en Skool</p>
        </div>
      </main>
      <footer className="access-footer">
        <span>Acceso solo para miembros. No hay registro abierto.</span>
        <Link href="/">Creativos AI</Link>
      </footer>
    </section>
  );
}
