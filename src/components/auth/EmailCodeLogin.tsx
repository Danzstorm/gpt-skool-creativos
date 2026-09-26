"use client";

import { useEffect, useRef, useState } from "react";

// Alternativa a Google: código de 8 dígitos por correo, escrito en esta misma
// pantalla. No hay enlace que abrir, así que no importa desde qué navegador o app
// de correo se lea, ni que un antivirus lo abra antes.

const RESEND_SECONDS = 60;

const ERRORS: Record<string, string> = {
  invalid_email: "Revisa el correo: parece que falta algo.",
  invalid_code: "El código no es correcto o ya venció. Revísalo o pide uno nuevo.",
  rate_limited: "Pediste varios códigos seguidos. Espera un minuto y vuelve a intentarlo.",
  send_failed: "No pudimos enviar el correo. Intenta de nuevo en un momento.",
  temporary: "No pudimos verificar tu acceso ahora mismo. Intenta de nuevo en un minuto.",
};
const GENERIC_ERROR = "Algo falló. Intenta de nuevo.";

const inputClass =
  "min-h-11 w-full rounded-[10px] border border-solid border-[#ffffff14] bg-[#141416] px-4 text-[14px] text-[#eeeef2] placeholder:text-[#6f6f78] focus:border-[#ffffff33] focus:outline-none";
const submitClass =
  "flex min-h-11 w-full items-center justify-center rounded-[10px] border border-solid border-[#ffffff20] bg-[linear-gradient(115deg,#ff682f20,#ff165e24,#7753ff26)] text-[14px] text-[#f4f1f5] [transition:background_.2s,transform_.2s] hover:bg-[linear-gradient(115deg,#ff682f30,#ff165e35,#7753ff35)] active:[transform:scale(.98)] disabled:opacity-50";
const linkClass = "text-[12px] text-[#a8a8b2] hover:text-[#eeeef2] disabled:opacity-50";

async function post(url: string, body: object): Promise<{ ok: boolean; data: Record<string, string> }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "send_failed" } };
  }
}

export default function EmailCodeLogin({ onOpen }: { onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await post("/api/auth/email-code", { email });
    setBusy(false);
    if (!ok) {
      setError(ERRORS[data.error] ?? GENERIC_ERROR);
      return;
    }
    setStep("code");
    setCode("");
    setWait(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await post("/api/auth/verify-code", { email, code });
    if (!ok || !data.redirect) {
      setBusy(false);
      setError(ERRORS[data.error] ?? GENERIC_ERROR);
      return;
    }
    // Navegación completa: la sesión quedó en cookies y el proxy debe verla.
    window.location.assign(data.redirect);
  }

  if (!open) {
    return (
      <button
        type="button"
        className={`${linkClass} mt-4`}
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        Entrar con un código por correo
      </button>
    );
  }

  return (
    <div className="mt-5 w-full text-left">
      <div className="mb-4 flex items-center gap-3 text-[11px] text-[#6f6f78]">
        <span className="h-px flex-1 bg-[#ffffff12]" />o con un código por correo<span className="h-px flex-1 bg-[#ffffff12]" />
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="grid gap-[10px]">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="tu correo de Skool"
            aria-label="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <button type="submit" disabled={busy || !email.trim()} className={submitClass}>
            {busy ? "Enviando…" : "Enviarme un código"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="grid gap-[10px]">
          <p className="text-center text-[12px] leading-[1.6] text-[#92929c]">
            Si <strong className="font-normal text-[#eeeef2]">{email}</strong> tiene acceso, te llegó un código. Revisa
            también la carpeta de spam.
          </p>
          <input
            ref={codeRef}
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={10}
            placeholder="Código"
            aria-label="Código de acceso"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} text-center text-[20px] tracking-[6px] tabular-nums placeholder:text-[14px] placeholder:tracking-normal`}
          />
          <button type="submit" disabled={busy || code.length < 6} className={submitClass}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className={linkClass}
              onClick={() => {
                setStep("email");
                setError("");
              }}
            >
              Usar otro correo
            </button>
            <button type="button" className={linkClass} disabled={busy || wait > 0} onClick={() => sendCode()}>
              {wait > 0 ? `Reenviar código (${wait}s)` : "Reenviar código"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-center text-[12px] leading-[1.6] text-[#e6c568]">
          {error}
        </p>
      )}
    </div>
  );
}
