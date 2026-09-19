import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  PanelLeftClose,
  Pencil,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { Gpt, Project, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { groupThreadsByProject } from "@/lib/project-grouping";
import { getGptVisual } from "@/lib/gpt-visual";
import Orb from "@/components/ui/Orb";
import GptGlyph from "./GptGlyph";
import ThreadListItem, { THREAD_DND_TYPE } from "./ThreadListItem";
import SidebarFooter from "./SidebarFooter";

// Solo para el hint del atajo (⌘K vs Ctrl K); el atajo acepta ambas teclas.
const APPLE_UA = /Mac|iPhone|iPad/;
const noSubscribe = () => () => {};

interface Props {
  communityName: string;
  gpts: Gpt[];
  threadList: ThreadSummary[];
  projects: Project[];
  openProjectIds: string[];
  activeGptId: string | null;
  activeThreadId: string | null;
  sidebarOpen: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  profile: {
    fullName: string | null;
    email: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
  };
  chatSearch: string;
  onSearchChange: (value: string) => void;
  onSelectGpt: (gptId: string) => void;
  onAccentHover: (hex: string | null) => void;
  onSelectThread: (thread: ThreadSummary) => void;
  onNewChat: () => void;
  onCloseSidebar: () => void;
  onOpenGptChats: (gptId: string) => void;
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
  threadList,
  projects,
  openProjectIds,
  activeGptId,
  activeThreadId,
  sidebarOpen,
  collapsed,
  onToggleCollapse,
  profile,
  chatSearch,
  onSearchChange,
  onSelectGpt,
  onAccentHover,
  onSelectThread,
  onNewChat,
  onCloseSidebar,
  onOpenGptChats,
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

  const searchRef = useRef<HTMLInputElement>(null);
  // El user agent solo existe en el navegador; en el servidor se asume Ctrl.
  const isMac = useSyncExternalStore(
    noSubscribe,
    () => APPLE_UA.test(navigator.userAgent),
    () => false
  );

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

  const gptNameById = useMemo(() => new Map(gpts.map((g) => [g.id, g.name])), [gpts]);

  const { groups, loose } = useMemo(
    () => groupThreadsByProject(threadList, projects, chatSearch, gptNameById),
    [threadList, projects, chatSearch, gptNameById]
  );

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
    />
  );

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={onCloseSidebar} />
      )}

      <aside
        className={cn(
          "flex-col border-r border-zinc-800 bg-zinc-950 z-30 overflow-hidden",
          "md:flex md:relative md:translate-x-0 transition-[width] duration-200 ease-out",
          collapsed ? "md:w-0 md:border-r-0" : "md:w-64",
          "fixed top-0 bottom-0 left-0 flex w-64 transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="w-64 h-full flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Orb size="xs" />
              <span className="font-display wordmark italic uppercase brand-text font-extrabold text-[15px] tracking-tight truncate">
                {communityName}
              </span>
            </div>
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex flex-shrink-0 items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-ink hover:bg-white/[0.06] transition"
              title="Contraer panel"
              aria-label="Contraer panel"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          <div className="px-2 pb-2 space-y-2">
            <button
              onClick={onNewChat}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition"
            >
              <SquarePen size={16} />
              Nuevo chat
            </button>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                ref={searchRef}
                value={chatSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-7 pr-14 py-2.5 text-[13px] text-zinc-200 placeholder-zinc-600 transition focus:border-brand/40 focus:outline-none"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <p className="eyebrow text-zinc-500 px-2.5 pt-1.5 pb-1">GPTs</p>
            <div className="space-y-0.5 mb-3">
              {gpts.map((g) => {
                const accentHex = getGptVisual(g.category, g.name, g.description).accentHex;
                const isActive = activeGptId === g.id && !activeThreadId;
                return (
                <div
                  key={g.id}
                  className="group relative flex items-center"
                  onPointerEnter={() => onAccentHover(accentHex)}
                  onPointerLeave={() => onAccentHover(null)}
                >
                  <button
                    onClick={() => onSelectGpt(g.id)}
                    onFocus={() => onAccentHover(accentHex)}
                    onBlur={() => onAccentHover(null)}
                    style={{ "--craft": accentHex } as CSSProperties}
                    className={cn(
                      "gpt-nav flex-1 min-w-0 flex items-center gap-2 rounded-lg pl-2.5 pr-7 py-1.5 text-[13px] transition-colors text-left cursor-pointer active:scale-[0.99]",
                      isActive ? "nav-active text-ink" : "text-zinc-400"
                    )}
                  >
                    <GptGlyph gpt={g} size="xs" />
                    <span className="truncate">{g.name}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenGptChats(g.id);
                    }}
                    className="hidden group-hover:flex items-center justify-center absolute right-1 w-6 h-6 rounded-md text-zinc-500 hover:text-ink hover:bg-zinc-800"
                    title={`Ver conversaciones de ${g.name}`}
                    aria-label={`Ver conversaciones de ${g.name}`}
                  >
                    <Search size={12} />
                  </button>
                </div>
                );
              })}
            </div>

            {groups.length > 0 && (
              <>
                <p className="eyebrow text-zinc-500 px-2.5 pt-2 pb-1">Proyectos</p>
                <div className="space-y-0.5 mb-3">
                  {groups.map(({ project, threads, forceOpen }) => {
                    const isOpen = forceOpen || openProjectIds.includes(project.id);
                    const isRenamingProject = renamingProjectId === project.id;
                    return (
                      <div key={project.id}>
                        <div
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
                          className={cn(
                            "group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer text-[13px] transition text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
                            dropProjectId === project.id && "ring-1 ring-brand/50 bg-brand/10"
                          )}
                          onClick={() => onToggleProject(project.id)}
                        >
                          {isOpen ? (
                            <ChevronDown size={12} className="flex-shrink-0 text-zinc-600" />
                          ) : (
                            <ChevronRight size={12} className="flex-shrink-0 text-zinc-600" />
                          )}
                          <Folder size={12} className="flex-shrink-0 text-zinc-500" />

                          {isRenamingProject ? (
                            <input
                              autoFocus
                              value={projectRenameValue}
                              onChange={(e) => onProjectRenameValueChange(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") onSubmitProjectRename(project.id);
                                if (e.key === "Escape") onCancelProjectRename();
                              }}
                              onBlur={() => onSubmitProjectRename(project.id)}
                              className="flex-1 bg-zinc-800 rounded-md px-1.5 py-0.5 text-ink text-[13px] focus:outline-none"
                            />
                          ) : (
                            <>
                              <span className="flex-1 min-w-0 truncate">{project.name}</span>
                              <span className="text-[11px] text-zinc-600 group-hover:hidden max-md:hidden">
                                {threads.length || ""}
                              </span>
                            </>
                          )}

                          {!isRenamingProject && (
                            // `max-md:flex` porque `group-hover` no existe en
                            // touch: sin esto, en el celular no hay ninguna
                            // forma de crear un chat dentro de la carpeta.
                            <div className="hidden group-hover:flex max-md:flex items-center gap-0.5 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNewChatInProject(project.id);
                                }}
                                className="p-1 rounded-md text-zinc-500 hover:text-ink hover:bg-zinc-800"
                                title="Nuevo chat en este proyecto"
                                aria-label="Nuevo chat en este proyecto"
                              >
                                <SquarePen size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditProjectInstructions(project);
                                }}
                                className={cn(
                                  "p-1 rounded-md hover:bg-zinc-800",
                                  // Teñido cuando la carpeta ya tiene texto: es
                                  // la única señal de que estos chats están
                                  // respondiendo con un contexto extra que no se
                                  // ve en la conversación.
                                  project.instructions
                                    ? "text-brand-pink hover:text-brand"
                                    : "text-zinc-500 hover:text-ink"
                                )}
                                title={
                                  project.instructions
                                    ? "Editar las instrucciones del proyecto"
                                    : "Agregar instrucciones al proyecto"
                                }
                                aria-label="Instrucciones del proyecto"
                              >
                                <FileText size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartProjectRename(project);
                                }}
                                className="p-1 rounded-md text-zinc-500 hover:text-ink hover:bg-zinc-800"
                                title="Renombrar proyecto"
                                aria-label="Renombrar proyecto"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteProject(project.id);
                                }}
                                className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                                title="Borrar proyecto"
                                aria-label="Borrar proyecto"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </div>

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
              <>
                <p className="eyebrow text-zinc-500 px-2.5 pt-2 pb-1">Chats</p>
                <div
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
                  className={cn(
                    "space-y-0.5 rounded-lg",
                    dropLoose && "ring-1 ring-brand/50 bg-brand/10"
                  )}
                >
                  {loose.map(renderThread)}
                  {loose.length === 0 && (
                    <p className="px-2.5 py-2 text-[12px] text-zinc-600">
                      Arrastra un chat aquí para sacarlo de su proyecto.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <SidebarFooter
            fullName={profile.fullName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
            isAdmin={profile.isAdmin}
          />
        </div>
      </aside>
    </>
  );
}

export default memo(ChatSidebar);
