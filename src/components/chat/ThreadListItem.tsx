import { memo, useCallback, useRef, useState } from "react";
import type { Project, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import OverflowMenu from "./OverflowMenu";

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
  pinned?: boolean;
  onTogglePin?: (id: string) => void;
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
  pinned,
  onTogglePin,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const clickTimer = useRef<number>(0);
  const moreRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const projectsEnabled = !!projects && !!onMoveToProject && !!onCreateProjectWith;
  const otherProjects = (projects ?? []).filter((p) => p.id !== thread.project_id);

  function beginRename() {
    closeMenu();
    onStartRename(thread);
  }

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
        // Sin `.nav` / `.history-item`: medidas Martin history (padding 9 vertical en chats).
        "group relative flex w-full cursor-grab items-center gap-3 rounded-[10px] border border-transparent px-2.5 py-[9px] text-left text-[13px] text-[#ababab] active:cursor-grabbing",
        "hover:bg-white/[0.03]",
        isActive && "chat-selected bg-[#222225] text-[#eeeef2]",
        pinned && "chat-pinned",
        dropTarget && "drop-target"
      )}
      onClick={(e) => {
        if (isRenaming || (e.target as HTMLElement).closest("input,.chat-more,.folder-options")) return;
        if (e.detail >= 2) return;
        window.clearTimeout(clickTimer.current);
        clickTimer.current = window.setTimeout(() => onSelect(thread), 240);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("input,.chat-more,.folder-options")) return;
        e.preventDefault();
        e.stopPropagation();
        window.clearTimeout(clickTimer.current);
        beginRename();
      }}
    >
      <span className="chat-pin" aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M8 3h8l-1 6 3 3v3H6v-3l3-3-1-6Zm4 12v6" />
        </svg>
      </span>
      <span
        className="chat-name relative min-w-0 line-clamp-2 overflow-hidden text-ellipsis whitespace-normal leading-[1.35] [overflow-wrap:anywhere]"
        title={isRenaming ? undefined : "Doble clic para cambiar el nombre"}
      >
        {isRenaming ? (
          <>
            <span aria-hidden style={{ visibility: "hidden" }}>
              {thread.title || "\u00a0"}
            </span>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmitRename(thread.id);
                }
                if (e.key === "Escape") onCancelRename();
              }}
              onBlur={() => onSubmitRename(thread.id)}
              className="folder-rename absolute left-0 top-0 h-5 w-full"
              aria-label="Nuevo nombre del chat"
            />
          </>
        ) : (
          thread.title
        )}
      </span>

      {!isRenaming && (
        <button
          ref={moreRef}
          type="button"
          className="chat-more"
          aria-label={`Opciones de ${thread.title}`}
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
        </button>
      )}

      <OverflowMenu
        open={menuOpen}
        onClose={closeMenu}
        triggerRef={moreRef}
        className="folder-options chat-options"
      >
        {onTogglePin && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onTogglePin(thread.id);
              closeMenu();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6Zm3 12v6" />
            </svg>
            {pinned ? "Desfijar" : "Fijar"}
          </button>
        )}
        <button type="button" role="menuitem" onClick={beginRename}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" />
          </svg>
          Renombrar
        </button>
        {projectsEnabled &&
          otherProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onMoveToProject?.(thread.id, p.id);
                closeMenu();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 7h16v12H4Z" />
                <path d="M4 7 7 3h6l3 4" />
              </svg>
              {p.name}
            </button>
          ))}
        {projectsEnabled && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCreateProjectWith?.([thread.id]);
              closeMenu();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 7h16v12H4Z" />
              <path d="M4 7 7 3h6l3 4M12 11v6m-3-3h6" />
            </svg>
            Nuevo Proyecto
          </button>
        )}
        {projectsEnabled && thread.project_id && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onMoveToProject?.(thread.id, null);
              closeMenu();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 7h16v12H4Z" />
              <path d="M9 13h6" />
            </svg>
            Sacar del proyecto
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDelete(thread.id);
            closeMenu();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" />
          </svg>
          Borrar
        </button>
      </OverflowMenu>
    </div>
  );
}

export default memo(ThreadListItem);
