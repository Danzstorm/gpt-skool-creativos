"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  adminBrandAccentClass,
  adminBrandClass,
  adminEyebrowClass,
  adminPrimaryClass,
} from "./admin-ui";

const NAV = [
  { href: "/admin", label: "Resumen", match: (p: string) => p === "/admin" },
  { href: "/admin/gpts", label: "GPTs", match: (p: string) => p.startsWith("/admin/gpts") },
  { href: "/admin/members", label: "Miembros", match: (p: string) => p.startsWith("/admin/members") },
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
  // Sin nodo (primer paint) o nodo ya desmontado al cambiar de ruta: no portal.
  // createPortal a un target suelto tira en React 19 y tumba /admin.
  if (!slot?.isConnected) return null;
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
  const isDashboard = pathname === "/admin";
  const head = HEAD[pathname] ?? HEAD["/admin"];
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex h-full min-h-full w-full max-w-[100vw] max-[650px]:block [&_svg.lucide]:h-[unset] [&_svg.lucide]:w-[unset]">
      <aside className="sticky top-0 flex h-dvh w-[238px] shrink-0 flex-col gap-6 border-r border-solid border-r-[#ffffff09] bg-[#111113] px-6 py-9 max-[900px]:w-[190px] max-[900px]:px-[18px] max-[900px]:py-7 max-[650px]:static max-[650px]:h-auto max-[650px]:w-full max-[650px]:gap-[15px] max-[650px]:p-5">
        <Link href="/chat" className={adminBrandClass}>
          {communityName} <span className={adminBrandAccentClass}>AI</span>
        </Link>
        <Link href="/admin/members" className={cn(adminPrimaryClass, "w-full text-[12px]")}>
          ＋ Importar miembros
        </Link>
        <div className={cn(adminEyebrowClass, "mt-[10px] max-[650px]:hidden")}>ADMINISTRACIÓN</div>
        <nav className="grid gap-[6px] max-[700px]:flex-wrap">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block w-full rounded-[10px] border-none p-[13px] text-left text-[13px] no-underline",
                item.match(pathname) && "bg-[linear-gradient(110deg,#ff682f12,#ff165e12,#7753ff20)]"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-[18px] text-[12px] text-[#95959e] max-[650px]:flex max-[650px]:flex-wrap max-[650px]:gap-[14px] max-[650px]:text-[10px]">
          <Link href="/unauthorized?reason=never_member">Vista de acceso restringido ↗</Link>
          <Link href="/chat">Volver a la plataforma</Link>
        </div>
      </aside>
      <main className="m-auto w-auto min-w-0 flex-1 overflow-y-auto px-[52px] pt-10 pb-[60px] max-[900px]:px-6 max-[650px]:px-[18px]">
        <header
          className={cn(
            "flex flex-wrap items-center justify-end gap-6 max-[650px]:flex-col max-[650px]:items-start",
            isDashboard ? "mb-0 min-h-0" : "mb-[25px]"
          )}
        >
          {!isDashboard && (
            <div>
              <div className={adminEyebrowClass}>{head.eyebrow}</div>
              <h1 className="my-3 font-[family-name:var(--font-display)] text-[36px] leading-[normal] font-normal tracking-[-1.2px] max-[650px]:text-[30px]">
                {head.title}
              </h1>
              <p className="text-[#8e8e98]">{head.sub}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3" ref={setActionSlot} />
        </header>
        <HeaderSlotContext.Provider value={actionSlot}>
          <div>{children}</div>
        </HeaderSlotContext.Provider>
      </main>
    </div>
  );
}
