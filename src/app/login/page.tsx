"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

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
              Creativos
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
              en 10 minutos.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
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

            <div className="flex items-center gap-3 text-xs text-stone-600">
              <div className="flex-1 h-px bg-stone-800" />
              o con tu correo
              <div className="flex-1 h-px bg-stone-800" />
            </div>

            {status === "error" && (
              <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-red-300 text-sm">
                {errorMsg}
                {errorMsg.toLowerCase().includes("acceso") && (
                  <a
                    href={process.env.NEXT_PUBLIC_SKOOL_URL || "https://www.skool.com/"}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-2 text-violet-300 underline"
                  >
                    Unirme al Skool de Creativos →
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
              <span className="text-stone-400">Skool Creativos</span>. No hay registro abierto.
            </p>
          </form>
          </div>
        )}
      </div>
    </div>
  );
}
