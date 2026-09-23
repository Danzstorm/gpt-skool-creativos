import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import type { Gpt, Project, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { groupThreadsByProject } from "@/lib/project-grouping";
import { sortPinnedFirst } from "@/lib/pinned-threads";
import GptGlyph from "./GptGlyph";
import HaloRim from "./HaloRim";
import OverflowMenu from "./OverflowMenu";
import ProtoIcon from "./ProtoIcon";
import ThreadListItem, { THREAD_DND_TYPE } from "./ThreadListItem";
import SidebarFooter from "./SidebarFooter";

// El atajo ⌘K / Ctrl K sigue vivo; el prototipo no pinta el badge.

function ProjectHeading({
  project,
  threadCount,
  isOpen,
  dropActive,
  isRenaming,
  renameValue,
  onToggle,
  onDragOver,
  onDragLeave,
  onDrop,
  onRenameValueChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onNewChat,
  onEditInstructions,
  onDelete,
}: {
  project: Project;
  threadCount: number;
  isOpen: boolean;
  dropActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onToggle: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onRenameValueChange: (value: string) => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onNewChat: () => void;
  onEditInstructions: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const clickTimer = useRef(0);
  const moreRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn("folder-heading group flex items-center gap-1.5", dropActive && "drop-target")}
      onClick={(e) => {
        if (isRenaming || (e.target as HTMLElement).closest("input,.folder-more,.folder-options")) return;
        if (e.detail >= 2) return;
        window.clearTimeout(clickTimer.current);
        clickTimer.current = window.setTimeout(onToggle, 240);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("input,.folder-more,.folder-options")) return;
        e.preventDefault();
        e.stopPropagation();
        window.clearTimeout(clickTimer.current);
        closeMenu();
        onStartRename();
      }}
    >
      {isOpen ? (
        <ChevronDown size={12} className="flex-shrink-0 text-zinc-600" />
      ) : (
        <ChevronRight size={12} className="flex-shrink-0 text-zinc-600" />
      )}
      <Folder size={12} className="flex-shrink-0 text-zinc-500" />

      <span className="folder-title" title={isRenaming ? undefined : "Doble clic para cambiar el nombre"}>
        {isRenaming ? (
          <>
            <span aria-hidden style={{ visibility: "hidden" }}>
              {project.name || "\u00a0"}
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
                  onSubmitRename();
                }
                if (e.key === "Escape") onCancelRename();
              }}
              onBlur={onSubmitRename}
              className="folder-rename"
              aria-label="Nombre de la carpeta"
            />
          </>
        ) : (
          project.name
        )}
      </span>
      {!isRenaming && (
        <span className="folder-count max-md:hidden">{threadCount || ""}</span>
      )}

      {!isRenaming && (
        <span className="folder-actions">
          <button
            ref={moreRef}
            type="button"
            className="folder-more"
            aria-label={`Opciones de ${project.name}`}
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
        </span>
      )}

      <OverflowMenu open={menuOpen} onClose={closeMenu} triggerRef={moreRef}>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onNewChat();
            closeMenu();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo chat
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onEditInstructions();
            closeMenu();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 4h9l3 3v13H6Z" />
            <path d="M15 4v4h4" />
          </svg>
          {project.instructions ? "Editar instrucciones" : "Agregar instrucciones"}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onStartRename();
            closeMenu();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" />
          </svg>
          Cambiar nombre
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDelete();
            closeMenu();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" />
          </svg>
          Borrar carpeta
        </button>
      </OverflowMenu>
    </div>
  );
}

interface Props {
  communityName: string;
  gpts: Gpt[];
  /** Recientes del nav. El catálogo completo vive en home. */
  recentGpts: Gpt[];
  threadList: ThreadSummary[];
  projects: Project[];
  openProjectIds: string[];
  activeGptId: string | null;
  activeThreadId: string | null;
  sidebarOpen: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  sidebarWidth: number;
  onResizeWidth: (width: number) => void;
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  profile: {
    fullName: string | null;
    email: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
  };
  chatSearch: string;
  onSearchChange: (value: string) => void;
  onSelectGpt: (gptId: string) => void;
  onOpenAllGpts: () => void;
  onSelectThread: (thread: ThreadSummary) => void;
  onNewChat: () => void;
  onCloseSidebar: () => void;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onStartRename: (thread: ThreadSummary) => void;
  onSubmitRename: (id: string) => void;
  onCancelRename: () => void;
  onDeleteThread: (id: string) => void;
  onToggleProject: (id: string) => void;
  onNewChatInProject: (projectId: string) => void;
  onEditProjectInstructions: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onMoveToProject: (threadId: string, projectId: string | null) => void;
  onCreateProjectWith: (threadIds: string[]) => void;
  renamingProjectId: string | null;
  projectRenameValue: string;
  onProjectRenameValueChange: (value: string) => void;
  onStartProjectRename: (project: Project) => void;
  onSubmitProjectRename: (id: string) => void;
  onCancelProjectRename: () => void;
}

function ChatSidebar({
  communityName,
  gpts,
  recentGpts,
  threadList,
  projects,
  openProjectIds,
  activeGptId,
  activeThreadId,
  sidebarOpen,
  collapsed,
  onToggleCollapse,
  sidebarWidth,
  onResizeWidth,
  pinnedIds,
  onTogglePin,
  profile,
  chatSearch,
  onSearchChange,
  onSelectGpt,
  onOpenAllGpts,
  onSelectThread,
  onNewChat,
  onCloseSidebar,
  renamingId,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDeleteThread,
  onToggleProject,
  onNewChatInProject,
  onEditProjectInstructions,
  onDeleteProject,
  onMoveToProject,
  onCreateProjectWith,
  renamingProjectId,
  projectRenameValue,
  onProjectRenameValueChange,
  onStartProjectRename,
  onSubmitProjectRename,
  onCancelProjectRename,
}: Props) {
  const [dropProjectId, setDropProjectId] = useState<string | null>(null);
  const [dropLoose, setDropLoose] = useState(false);
  const [resizing, setResizing] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl K enfoca el buscador; si el panel está contraído lo abre antes.
  // El input ya existe en el DOM (aside de ancho 0), pero se espera un frame
  // para que el re-render y el foco no se pisen. No setea estado propio.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      if (collapsed) onToggleCollapse();
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed, onToggleCollapse]);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    if (collapsed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
    document.body.classList.add("resizing-sidebar");
    const left = asideRef.current?.getBoundingClientRect().left ?? 0;
    function onMove(ev: PointerEvent) {
      onResizeWidth(ev.clientX - left);
    }
    function onUp() {
      setResizing(false);
      document.body.classList.remove("resizing-sidebar");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const gptNameById = useMemo(() => new Map(gpts.map((g) => [g.id, g.name])), [gpts]);

  const { groups, loose } = useMemo(
    () => groupThreadsByProject(threadList, projects, chatSearch, gptNameById),
    [threadList, projects, chatSearch, gptNameById]
  );
  const looseSorted = useMemo(() => sortPinnedFirst(loose, pinnedIds), [loose, pinnedIds]);

  const renderThread = (t: ThreadSummary) => (
    <ThreadListItem
      key={t.id}
      thread={t}
      isActive={t.id === activeThreadId}
      isRenaming={renamingId === t.id}
      renameValue={renameValue}
      projects={projects}
      onSelect={onSelectThread}
      onRenameValueChange={onRenameValueChange}
      onStartRename={onStartRename}
      onSubmitRename={onSubmitRename}
      onCancelRename={onCancelRename}
      onDelete={onDeleteThread}
      onMoveToProject={onMoveToProject}
      onCreateProjectWith={onCreateProjectWith}
      // Soltar sobre un chat que YA está en una carpeta significa "mandalo
      // ahí", no "armá una carpeta nueva con estos dos y dejá la otra a medias".
      onDropOnThread={(draggedId, targetId) => {
        const target = threadList.find((x) => x.id === targetId);
        if (target?.project_id) onMoveToProject(draggedId, target.project_id);
        else onCreateProjectWith([draggedId, targetId]);
      }}
      pinned={pinnedIds.includes(t.id)}
      onTogglePin={onTogglePin}
    />
  );

  return (
    <>
      {sidebarOpen && (
        <button type="button" className="menuveil" aria-label="Cerrar menú" onClick={onCloseSidebar} />
      )}

      <aside
        ref={asideRef}
        className={cn(
          "sidebar z-30",
          "md:flex md:relative md:translate-x-0",
          resizing ? "md:transition-none" : undefined,
          "fixed top-0 bottom-0 left-0 flex",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        style={{ "--sidebar-user-width": `${sidebarWidth}px` } as React.CSSProperties}
      >
        <div className="flex h-full w-full min-w-0 flex-shrink-0 flex-col">
          <div className="brandrow">
            <a className="brand" href="https://www.skool.com/creativos" aria-label={`${communityName} en Skool`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.svg"
                width={94}
                height={25}
                alt={communityName}
                className="block h-[25px] w-[94px]"
              />
            </a>
            <button
              type="button"
              className="collapse"
              onClick={onToggleCollapse}
              aria-label="Contraer panel"
              title="Contraer panel"
            >
              <span aria-hidden className="collapse-chevron">
                ‹
              </span>
            </button>
          </div>

          <button type="button" className="new tool" id="new" onClick={onNewChat}>
            <HaloRim id="new-chat" />
            ＋ <span>Nuevo chat</span>
          </button>
          <label className="side-search">
            <ProtoIcon name="search" />
            <input
              ref={searchRef}
              id="sideSearch"
              value={chatSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar..."
              aria-label="Buscar herramientas"
            />
          </label>

          <div className="label">GPTs</div>
          <nav id="navigation">
              {recentGpts.map((g) => {
                const isActive = activeGptId === g.id;
                return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onSelectGpt(g.id)}
                  className={cn("nav", isActive && "active")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <GptGlyph gpt={g} size="xs" variant="nav" />
                  {g.name}
                </button>
                );
              })}
              <button
                type="button"
                id="allNav"
                onClick={onOpenAllGpts}
                className={cn("nav", !activeGptId && "active")}
                aria-current={!activeGptId ? "page" : undefined}
              >
                <ProtoIcon name="grid" />
                Todos los GPTs
              </button>
          </nav>

          <div className="flex-1 overflow-y-auto">
            {groups.length > 0 && (
              <>
                <div className="label">Proyectos</div>
                <div className="space-y-0.5 mb-3">
                  {groups.map(({ project, threads, forceOpen }) => {
                    const isOpen = forceOpen || openProjectIds.includes(project.id);
                    const isRenamingProject = renamingProjectId === project.id;
                    return (
                      <div key={project.id}>
                        <ProjectHeading
                          project={project}
                          threadCount={threads.length}
                          isOpen={isOpen}
                          dropActive={dropProjectId === project.id}
                          isRenaming={isRenamingProject}
                          renameValue={projectRenameValue}
                          onToggle={() => onToggleProject(project.id)}
                          onDragOver={(e) => {
                            if (!e.dataTransfer.types.includes(THREAD_DND_TYPE)) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDropProjectId(project.id);
                          }}
                          onDragLeave={() => setDropProjectId((id) => (id === project.id ? null : id))}
                          onDrop={(e) => {
                            if (!e.dataTransfer.types.includes(THREAD_DND_TYPE)) return;
                            e.preventDefault();
                            setDropProjectId(null);
                            const threadId = e.dataTransfer.getData(THREAD_DND_TYPE);
                            if (threadId) onMoveToProject(threadId, project.id);
                          }}
                          onRenameValueChange={onProjectRenameValueChange}
                          onStartRename={() => onStartProjectRename(project)}
                          onSubmitRename={() => onSubmitProjectRename(project.id)}
                          onCancelRename={onCancelProjectRename}
                          onNewChat={() => onNewChatInProject(project.id)}
                          onEditInstructions={() => onEditProjectInstructions(project)}
                          onDelete={() => onDeleteProject(project.id)}
                        />

                        {isOpen && threads.length > 0 && (
                          <div className="space-y-0.5 pl-3 mt-0.5">{threads.map(renderThread)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Con proyectos en pantalla la sección se muestra aunque esté
                vacía: si desaparece al mover el último chat suelto a una
                carpeta, se lee como que los chats se perdieron. Vacía y con
                su texto, además, es el lugar donde soltar para sacarlos. */}
            {(loose.length > 0 || groups.length > 0) && (
              // Martin: label CHATS vive DENTRO de .history. El border-top de
              // `.history{border-top:1px solid var(--line)}` queda ARRIBA del
              // label (separador GPTS→CHATS), no debajo como si el label fuera
              // hermano previo.
              <div
                className={cn(
                  "history space-y-0.5 rounded-lg",
                  dropLoose && "ring-1 ring-brand/50 bg-brand/10"
                )}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(THREAD_DND_TYPE)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropLoose(true);
                }}
                onDragLeave={() => setDropLoose(false)}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes(THREAD_DND_TYPE)) return;
                  e.preventDefault();
                  setDropLoose(false);
                  const threadId = e.dataTransfer.getData(THREAD_DND_TYPE);
                  // `null` = fuera de toda carpeta. Es el gesto inverso al de
                  // arrastrar hacia un proyecto, que ya existía sin vuelta.
                  if (threadId) onMoveToProject(threadId, null);
                }}
              >
                <div className="label">Chats</div>
                {looseSorted.map(renderThread)}
                {loose.length === 0 && (
                  <p className="px-2.5 py-2 text-[12px] text-zinc-600">
                    Arrastra un chat aquí para sacarlo de su proyecto.
                  </p>
                )}
              </div>
            )}
          </div>

          <SidebarFooter
            fullName={profile.fullName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
            isAdmin={profile.isAdmin}
          />
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ancho del panel"
          tabIndex={0}
          onPointerDown={startResize}
        />
      </aside>
    </>
  );
}

export default memo(ChatSidebar);
