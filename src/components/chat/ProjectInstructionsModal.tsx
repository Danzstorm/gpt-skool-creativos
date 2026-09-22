import { useCallback, useRef, useState } from "react";
import { Folder, X } from "lucide-react";
import type { Project } from "@/lib/types";
import { MAX_PROJECT_INSTRUCTIONS_CHARS } from "@/lib/project-instructions";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Props {
  project: Project;
  onClose: () => void;
  onSave: (id: string, instructions: string) => Promise<void>;
}

export default function ProjectInstructionsModal({ project, onClose, onSave }: Props) {
  const [value, setValue] = useState(project.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dirty = value.trim() !== (project.instructions ?? "").trim();

  // Cerrar guarda si hay cambios, en vez de descartarlos. Es el mismo criterio
  // que el rename inline del sidebar (guarda en blur) y evita el peor final
  // posible: escribir el contexto de la marca, tocar fuera del panel sin querer
  // y perderlo. Si el guardado falla, el panel se queda abierto con el texto.
  const closeSaving = useCallback(async () => {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(project.id, value);
      onClose();
    } catch {
      setError("No se pudo guardar. Revisa la conexión e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [dirty, onClose, onSave, project.id, value]);

  // Radix solo pide cerrar (Escape / click fuera / X); `closeSaving` decide.
  // El foco inicial va al textarea a mano: el FocusScope de Radix corre después
  // del `autoFocus` de React y se lo llevaría al primer focusable (la X).
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeSaving();
      }}
    >
      <DialogContent
        className="max-w-lg flex flex-col"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
          <Folder size={16} className="text-zinc-500 flex-shrink-0" />
          <DialogTitle className="flex-1 min-w-0 truncate text-sm font-semibold text-zinc-100">
            {project.name}
          </DialogTitle>
          <DialogClose asChild>
            <button
              disabled={saving}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-ink hover:bg-white/[0.06] transition disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </DialogClose>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label
              htmlFor="project-instructions"
              className="block text-sm font-medium text-zinc-200 mb-1"
            >
              Instrucciones del proyecto
            </label>
            <p className="text-xs text-zinc-500">
              Todos los chats de esta carpeta las reciben antes de responder. Sirve para el tono, el
              público o las reglas de la marca — no para pegar un brief entero.
            </p>
          </div>

          <textarea
            id="project-instructions"
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            // `maxLength` nativo además del tope de la ruta y del CHECK de la
            // base: cortar mientras se escribe avisa antes que un error después
            // de haber escrito de más.
            maxLength={MAX_PROJECT_INSTRUCTIONS_CHARS}
            rows={8}
            placeholder="La marca es Creativos. Tono cercano, sin tecnicismos. El público son emprendedores que recién arrancan."
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-y"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-600">
              {value.length}/{MAX_PROJECT_INSTRUCTIONS_CHARS}
            </span>
            <button
              onClick={closeSaving}
              disabled={saving}
              className="rounded-xl bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
