import { memo, useCallback, useState } from "react";
import Link from "next/link";
import { LayoutGrid, ShieldCheck, LogOut, ChevronUp } from "lucide-react";
import { useDismissable } from "@/lib/useDismissable";

interface Props {
  fullName: string | null;
  email: string | null;
  isAdmin: boolean;
}

function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function SidebarFooter({ fullName, email, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismissable<HTMLDivElement>(open, close);

  const displayName = fullName || email || "Cuenta";

  return (
    <div ref={rootRef} className="relative border-t border-zinc-800/80 p-2">
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1.5 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden py-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
            onClick={() => setOpen(false)}
          >
            <LayoutGrid size={15} />
            Catálogo
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
              onClick={() => setOpen(false)}
            >
              <ShieldCheck size={15} />
              Admin
            </Link>
          )}
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition text-left"
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
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-medium text-zinc-200">
          {initialsOf(fullName, email)}
        </span>
        <span className="flex-1 min-w-0 text-sm text-zinc-300 truncate">{displayName}</span>
        <ChevronUp size={14} className="text-zinc-600 flex-shrink-0" />
      </button>
    </div>
  );
}

export default memo(SidebarFooter);
