import { memo, useCallback, useRef, useState } from "react";
import type { Project, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import OverflowMenu from "./OverflowMenu";

// Tipo propio en el dataTransfer: durante dragover el navegador solo deja leer
// `types`, no el contenido, así que sin un tipo distinguible no se puede saber
// si lo que viene es un chat o los archivos que el composer también acepta.
export const THREAD_DND_TYPE = "application/x-thread-id";

/** Input de renombrar (chat y carpeta). "!": legacy aún trae
 *  button,input{font:inherit}, ::selection y :focus-visible{outline}. */
export const renameInputClass =
  "absolute top-0 left-0 m-0 box-border block h-5 w-full rounded-[5px] border border-[#ffffff25] bg-[#202024] px-1 py-0 align-top !leading-[18px] text-[#eee] caret-white selection:!bg-[rgba(255,65,101,.28)] focus:![outline:none] focus:![outline-offset:0] focus:border-[#ffffff38] focus:[box-shadow:inset_0_0_0_1px_#ffffff08]";

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
  // Opcionales: las carpetas se gestionan en el sidebar.
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
        // `nav history-item`: text-size.ts le da el tamaño de Martin (13px + 0.75,
        // escala de Configuración). Padding 9 vertical como sus chats.
        "nav history-item group relative flex w-full cursor-grab items-center gap-3 rounded-[10px] border border-transparent px-2.5 py-[9px] text-left text-[13px] text-[#ababab] active:cursor-grabbing",
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
      <span
        className={cn(
          "chat-pin pointer-events-none absolute top-1/2 left-2.5 -mt-[7px] h-3.5 w-3.5 text-[#a6a6af]",
          pinned ? "block" : "hidden"
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24">
          <path d="M8 3h8l-1 6 3 3v3H6v-3l3-3-1-6Zm4 12v6" />
        </svg>
      </span>
      <span
        className="chat-name relative min-w-0 line-clamp-2 overflow-hidden text-ellipsis whitespace-normal [overflow-wrap:anywhere]"
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
              className={renameInputClass}
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
          // Oculto salvo abierto o en táctil (Martin). `[display:grid]`, no
          // `grid`: la clase .grid del catálogo sigue en legacy.
          className={cn(
            "chat-more absolute top-1/2 right-2 [display:grid] h-5 w-5 cursor-pointer place-items-center rounded-[5px] opacity-0 [transform:translateY(-50%)]",
            "!text-[#92929c] hover:bg-[#ffffff09] hover:!text-[#eee] aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
          )}
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
        className="chat-options"
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
