"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", match: (p: string) => p === "/admin" },
  { href: "/admin/members", label: "Miembros y acceso", match: (p: string) => p.startsWith("/admin/members") },
  { href: "/admin/gpts", label: "GPTs", match: (p: string) => p.startsWith("/admin/gpts") },
  { href: "/admin/settings", label: "Ajustes", match: (p: string) => p.startsWith("/admin/settings") },
];

const HEAD: Record<string, { eyebrow: string; title: string; sub: string }> = {
  "/admin": {
    eyebrow: "CREATIVOS · ADMIN",
    title: "Dashboard",
    sub: "Uso, altas y costos de la plataforma.",
  },
  "/admin/members": {
    eyebrow: "TU COMUNIDAD, CONECTADA",
    title: "Control de acceso",
    sub: "Las personas detrás de las ideas.",
  },
  "/admin/gpts": {
    eyebrow: "CREATIVOS · ADMIN",
    title: "GPTs",
    sub: "Catálogo, prompts y modelos.",
  },
  "/admin/settings": {
    eyebrow: "CREATIVOS · ADMIN",
    title: "Ajustes",
    sub: "Marca, límites y administradores.",
  },
};

export default function AdminChrome({
  communityName,
  children,
}: {
  communityName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const head = HEAD[pathname] ?? HEAD["/admin"];

  return (
    <div className="ax-shell">
      <aside className="ax-side">
        <Link href="/chat" className="ax-brand">
          {communityName} <span>AI</span>
        </Link>
        <div className="ax-eyebrow">ADMINISTRACIÓN</div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`ax-nav${item.match(pathname) ? " active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
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
        </header>
        <div className="ax-tw">{children}</div>
      </main>
    </div>
  );
}
