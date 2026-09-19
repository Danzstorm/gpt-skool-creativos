"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogClose = DialogPrimitive.Close;

// Sin Portal: Content va dentro de Overlay para conservar el centrado flex
// y las animaciones `.modal-*`. Un translate(-50%,-50%) pelearía con el
// scale de `modal-pop`.
export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Overlay className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn("modal-panel w-full rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl outline-none", className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Overlay>
  );
}
