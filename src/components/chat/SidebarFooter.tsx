import { memo, useCallback, useState } from "react";
import Link from "next/link";
import { ShieldCheck, LogOut, ChevronsUpDown } from "lucide-react";
import { useDismissable } from "@/hooks/useDismissable";
import { humanDisplayName } from "@/lib/utils";

interface Props {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function SidebarFooter({ fullName, email, avatarUrl, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  // Las URLs de foto de Google caducan y a veces devuelven 403/404. Si la
  // imagen no carga, volvemos a las iniciales en vez de dejar un hueco roto.
  const [avatarFailed, setAvatarFailed] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismissable<HTMLDivElement>(open, close);

  const personName = humanDisplayName(fullName);
  const displayName = personName || email || "Cuenta";
  // Sin nombre, el email ya ocupa la primera línea: no repetirlo debajo.
  const subline = personName ? email : null;
  const showAvatar = !!avatarUrl && !avatarFailed;

  return (
    <div ref={rootRef} className="relative border-t border-white/[0.06] p-2">
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1.5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 py-1">
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.06] hover:text-ink transition"
              onClick={() => setOpen(false)}
            >
              <ShieldCheck size={15} />
              Admin
            </Link>
          )}
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.06] hover:text-ink transition text-left"
            >
              <LogOut size={15} />
              Salir
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition"
      >
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center text-[11px] font-medium text-zinc-200">
          {showAvatar ? (
            // <img> plano, no next/image: evita sumar el host de Google a
            // `remotePatterns` y optimizar una miniatura de 32px no aporta nada.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl!}
              alt=""
              width={32}
              height={32}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            initialsOf(fullName, email)
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-zinc-100 truncate">{displayName}</span>
          {subline && <span className="block text-[11px] text-zinc-500 truncate">{subline}</span>}
        </span>
        <ChevronsUpDown size={14} className="text-zinc-500 flex-shrink-0" />
      </button>
    </div>
  );
}

export default memo(SidebarFooter);
