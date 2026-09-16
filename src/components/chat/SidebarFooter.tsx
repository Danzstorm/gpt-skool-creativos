import { memo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { LayoutGrid, ShieldCheck, LogOut, ChevronUp, Palette, Check, X } from "lucide-react";
import { useDismissable } from "@/hooks/useDismissable";
import type { Theme } from "@/lib/types";

interface Props {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

// Colores fijos (no tokens de tema): cada tarjeta debe mostrarse siempre con
// SU propio look real, sin importar cuál tema esté activo ahora mismo — si
// usáramos clases como bg-zinc-950 acá, las 3 tarjetas se verían iguales
// (todas pintadas con el tema actualmente activo).
const THEME_PREVIEWS: {
  value: Theme;
  label: string;
  hint: string;
  bg: string;
  surface: string;
  bubble: string;
  accent: string;
  ink: string;
}[] = [
  {
    value: "creativo",
    label: "Creativo",
    hint: "El look de marca — violeta sobre negro cálido",
    bg: "#09090b",
    surface: "#18181b",
    bubble: "#27272a",
    accent: "#8b5cf6",
    ink: "#ffffff",
  },
  {
    value: "dark",
    label: "Dark",
    hint: "Oscuro neutro, minimalista",
    bg: "#212121",
    surface: "#2a2a2a",
    bubble: "#343434",
    accent: "#3fa080",
    ink: "#ececec",
  },
  {
    value: "light",
    label: "Papel",
    hint: "Papel tostado de estudio, acento arcilla",
    bg: "#efe7d3",
    surface: "#e8ddc6",
    bubble: "#ddd1b4",
    accent: "#c15f3c",
    ink: "#241f15",
  },
];

function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function AppearanceModal({
  theme,
  onThemeChange,
  onClose,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onClose: () => void;
}) {
  const panelRef = useDismissable<HTMLDivElement>(true, onClose);

  // Cerrar con Escape (accesibilidad de diálogo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal a <body>: el <aside> del sidebar tiene un `transform` (animación de
  // abrir/cerrar), y un `position: fixed` dentro de un ancestro con transform
  // se ancla a ESE ancestro, no a la pantalla — por eso el modal salía
  // aplastado en la esquina. Al portarlo fuera del sidebar se centra de verdad,
  // y además queda fuera del [data-theme], así el diálogo siempre se ve oscuro
  // y consistente sin importar el tema elegido.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        className="modal-panel w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl"
      >
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-zinc-800/80">
          <h2 className="flex-1 text-base font-semibold text-ink">Apariencia</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-ink hover:bg-zinc-800 transition"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-zinc-500 mb-4">
            Elige cómo se ve tu chat. Se guarda en tu cuenta — te sigue a donde entres.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEME_PREVIEWS.map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onThemeChange(opt.value)}
                  className={`text-left rounded-xl border-2 overflow-hidden transition ${
                    active ? "border-violet-500" : "border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  {/* Mini mockup: fondo + una burbuja + el acento, con los
                      colores reales de esa paleta (no clases de Tailwind). */}
                  <div
                    className="h-20 p-2.5 flex flex-col justify-end gap-1.5"
                    style={{ backgroundColor: opt.bg }}
                  >
                    <div
                      className="self-end w-3/5 h-3 rounded-md"
                      style={{ backgroundColor: opt.bubble }}
                    />
                    <div className="flex items-center gap-1">
                      <div
                        className="flex-1 h-4 rounded-md"
                        style={{ backgroundColor: opt.surface }}
                      />
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: opt.accent }}
                      />
                    </div>
                  </div>
                  <div className="px-3 py-2.5 bg-zinc-900 flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-zinc-100">{opt.label}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">{opt.hint}</span>
                    </span>
                    {active && <Check size={16} className="text-violet-400 flex-shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SidebarFooter({ fullName, email, avatarUrl, isAdmin, theme, onThemeChange }: Props) {
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  // Las URLs de foto de Google caducan y a veces devuelven 403/404. Si la
  // imagen no carga, volvemos a las iniciales en vez de dejar un hueco roto.
  const [avatarFailed, setAvatarFailed] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismissable<HTMLDivElement>(open, close);

  const displayName = fullName || email || "Cuenta";
  const showAvatar = !!avatarUrl && !avatarFailed;

  return (
    <div ref={rootRef} className="relative border-t border-zinc-800/80 p-2">
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1.5 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden py-1">
          <button
            onClick={() => {
              setOpen(false);
              setAppearanceOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-ink transition text-left"
          >
            <Palette size={15} />
            Apariencia
          </button>
          <div className="my-1 border-t border-zinc-800" />
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-ink transition"
            onClick={() => setOpen(false)}
          >
            <LayoutGrid size={15} />
            Catálogo
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-ink transition"
              onClick={() => setOpen(false)}
            >
              <ShieldCheck size={15} />
              Admin
            </Link>
          )}
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-ink transition text-left"
            >
              <LogOut size={15} />
              Salir
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-zinc-900 transition"
      >
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center text-[11px] font-medium text-zinc-200">
          {showAvatar ? (
            // <img> plano, no next/image: evita sumar el host de Google a
            // `remotePatterns` y optimizar una miniatura de 28px no aporta nada.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl!}
              alt=""
              width={28}
              height={28}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            initialsOf(fullName, email)
          )}
        </span>
        <span className="flex-1 min-w-0 text-sm text-zinc-300 truncate">{displayName}</span>
        <ChevronUp size={14} className="text-zinc-600 flex-shrink-0" />
      </button>

      {appearanceOpen && (
        <AppearanceModal
          theme={theme}
          onThemeChange={onThemeChange}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
    </div>
  );
}

export default memo(SidebarFooter);
