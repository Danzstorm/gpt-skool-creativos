"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Resumen", match: (p: string) => p === "/admin" },
  { href: "/admin/members", label: "Miembros", match: (p: string) => p.startsWith("/admin/members") },
  { href: "/admin/gpts", label: "GPTs", match: (p: string) => p.startsWith("/admin/gpts") },
  { href: "/admin/settings", label: "Ajustes", match: (p: string) => p.startsWith("/admin/settings") },
];

const HEAD: Record<string, { eyebrow: string; title: string; sub: string }> = {
  "/admin": {
    eyebrow: "CREATIVOS · ADMIN",
    title: "Resumen",
    sub: "Uso, altas y costos de la plataforma.",
  },
  "/admin/members": {
    eyebrow: "TU COMUNIDAD, CONECTADA",
    title: "Control de acceso",
    sub: "Las personas detrás de las ideas.",
  },
  "/admin/gpts": {
    eyebrow: "CREATIVOS · ADMIN",
    title: "Tus asistentes.",
    sub: "Un catálogo claro, ordenado y listo para crear.",
  },
  "/admin/settings": {
    eyebrow: "CREATIVOS · ADMIN",
    title: "Ajustes del espacio.",
    sub: "Identidad y límites, con controles fáciles de encontrar.",
  },
};

const HeaderSlotContext = createContext<HTMLElement | null>(null);

export function AdminHeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  if (!slot) return null;
  return createPortal(children, slot);
}

export default function AdminChrome({
  communityName,
  children,
}: {
  communityName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const head = HEAD[pathname] ?? HEAD["/admin"];
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);

  return (
    <div className="ax-shell">
      <aside className="ax-side">
        <Link href="/chat" className="ax-brand">
          {communityName} <span>AI</span>
        </Link>
        <div className="ax-eyebrow">ADMINISTRACIÓN</div>
        <nav className="ax-navigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`ax-nav${item.match(pathname) ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ax-side-bottom">
          <Link href="/unauthorized?reason=never_member">Vista de acceso restringido ↗</Link>
          <Link href="/chat">Volver a la plataforma</Link>
        </div>
      </aside>
      <main className="ax-main">
        <header className="ax-header">
          <div>
            <div className="ax-eyebrow">{head.eyebrow}</div>
            <h1>{head.title}</h1>
            <p>{head.sub}</p>
          </div>
          <div className="ax-header-actions" ref={setActionSlot} />
        </header>
        <HeaderSlotContext.Provider value={actionSlot}>
          <div className="ax-tw">{children}</div>
        </HeaderSlotContext.Provider>
      </main>
    </div>
  );
}
