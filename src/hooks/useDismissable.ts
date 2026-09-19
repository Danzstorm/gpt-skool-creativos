import { useEffect, useRef } from "react";

// Cierra un popover al hacer click fuera de `ref` o al presionar Escape.
// Lo usan SidebarFooter, el menú `@` del composer, ThreadListItem y GptTestModal.
// GptChatsModal y ProjectInstructionsModal pasaron a Radix Dialog.
export function useDismissable<T extends HTMLElement>(open: boolean, onDismiss: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onDismiss]);

  return ref;
}
