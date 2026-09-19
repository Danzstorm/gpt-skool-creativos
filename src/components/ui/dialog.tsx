"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogClose = DialogPrimitive.Close;

// Sin Portal a propósito: el root del chat lleva `zoom: 1.15` y un portal a
// <body> dejaría el diálogo fuera de esa escala (15 % más chico). Content va
// dentro de Overlay para conservar el centrado flex y las animaciones
// `.modal-*`; un translate(-50%,-50%) pelearía con el scale de `modal-pop`.
export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Overlay className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn("modal-panel glass-strong w-full rounded-2xl shadow-2xl outline-none", className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Overlay>
  );
}
