import { memo, useCallback, useState } from "react";
import { FolderInput, FolderPlus, FolderMinus, Pencil, Trash2 } from "lucide-react";
import type { Project, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDismissable } from "@/hooks/useDismissable";

// Tipo propio en el dataTransfer: durante dragover el navegador solo deja leer
// `types`, no el contenido, así que sin un tipo distinguible no se puede saber
// si lo que viene es un chat o los archivos que el composer también acepta.
export const THREAD_DND_TYPE = "application/x-thread-id";

interface Props {
  thread: ThreadSummary;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: (thread: ThreadSummary) => void;
  onRenameValueChange: (value: string) => void;
  onStartRename: (thread: ThreadSummary) => void;
  onSubmitRename: (id: string) => void;
  onCancelRename: () => void;
  onDelete: (id: string) => void;
  // Opcionales: las carpetas se gestionan en el sidebar. GptChatsModal reusa
  // esta fila solo para listar los chats de un GPT y no las necesita.
  projects?: Project[];
  onMoveToProject?: (threadId: string, projectId: string | null) => void;
  onCreateProjectWith?: (threadIds: string[]) => void;
  onDropOnThread?: (draggedId: string, targetId: string) => void;
}

function ThreadListItem({
  thread,
  isActive,
  isRenaming,
  renameValue,
  projects,
  onSelect,
  onRenameValueChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDelete,
  onMoveToProject,
  onCreateProjectWith,
  onDropOnThread,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useDismissable<HTMLDivElement>(menuOpen, closeMenu);

  const projectsEnabled = !!projects && !!onMoveToProject && !!onCreateProjectWith;
  const otherProjects = (projects ?? []).filter((p) => p.id !== thread.project_id);

  return (
    <div
      // Renombrando no se arrastra: con draggable activo el navegador se queda
      // con el mousedown y no se puede seleccionar texto dentro del input.
      draggable={projectsEnabled && !isRenaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(THREAD_DND_TYPE, thread.id);
        e.dataTransfer.setData("text/plain", thread.title);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!onDropOnThread || !e.dataTransfer.types.includes(THREAD_DND_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        if (!onDropOnThread || !e.dataTransfer.types.includes(THREAD_DND_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(false);
        const draggedId = e.dataTransfer.getData(THREAD_DND_TYPE);
        if (draggedId && draggedId !== thread.id) onDropOnThread(draggedId, thread.id);
      }}
      className={cn(
        "group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer text-[13px] transition",
        isActive ? "nav-active text-ink" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
                        dropTarget && "ring-1 ring-brand/50 bg-brand/10"
      )}
      onClick={() => onSelect(thread)}
    >
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmitRename(thread.id);
            if (e.key === "Escape") onCancelRename();
          }}
          onBlur={() => onSubmitRename(thread.id)}
          className="flex-1 bg-zinc-800 rounded-md px-1.5 py-0.5 text-ink text-[13px] focus:outline-none"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate">{thread.title}</span>
      )}

      {!isRenaming && (
        <div className="flex md:hidden md:group-hover:flex items-center gap-0.5 flex-shrink-0">
          {projectsEnabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="p-1 rounded-md text-zinc-500 hover:text-ink hover:bg-zinc-800"
              title="Mover a proyecto"
              aria-label="Mover a proyecto"
            >
              <FolderInput size={11} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartRename(thread);
            }}
            className="p-1 rounded-md text-zinc-500 hover:text-ink hover:bg-zinc-800"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(thread.id);
            }}
            className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* El menú es el único camino en móvil: el drag & drop de HTML5 no
          existe en touch. */}
      {menuOpen && projectsEnabled && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1 top-full mt-1 z-40 w-52 max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
        >
          {otherProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onMoveToProject?.(thread.id, p.id);
                closeMenu();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-zinc-800"
            >
              <FolderInput size={12} className="flex-shrink-0 text-zinc-500" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <button
            onClick={() => {
              onCreateProjectWith?.([thread.id]);
              closeMenu();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-zinc-800"
          >
            <FolderPlus size={12} className="flex-shrink-0 text-zinc-500" />
            Nuevo proyecto...
          </button>
          {thread.project_id && (
            <button
              onClick={() => {
                onMoveToProject?.(thread.id, null);
                closeMenu();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-zinc-800 border-t border-zinc-800"
            >
              <FolderMinus size={12} className="flex-shrink-0 text-zinc-500" />
              Sacar del proyecto
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ThreadListItem);
