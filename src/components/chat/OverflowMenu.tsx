"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Menú de tres puntos anclado al trigger y montado en `document.body`.
 * El sidebar recorta `overflow`; sin portal el panel queda tapado.
 * Posición: la misma fórmula que `positionChatMenu` del prototipo.
 */
export default function OverflowMenu({
  open,
  onClose,
  triggerRef,
  className = "folder-options",
  children,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;

    const place = () => {
      const r = trigger.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8))}px`;
    };
    place();

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menu?.contains(target)) return;
      if (trigger?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onReposition() {
      onClose();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, onClose, triggerRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <span ref={menuRef} className={className} role="menu">
      {children}
    </span>,
    document.body
  );
}
