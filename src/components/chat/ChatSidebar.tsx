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
import ThreadListItem, { THREAD_DND_TYPE, renameInputClass } from "./ThreadListItem";
import SidebarFooter from "./SidebarFooter";

// El atajo ⌘K / Ctrl K sigue vivo; el prototipo no pinta el badge.

const labelClass =
  "mx-2.5 mb-3 mt-[31px] text-[11px] font-normal uppercase !tracking-[1.3px] text-[#858585]";

// Martin .nav: gap 12, padding 12×10, 13px, radius 7. Activo = degradado espectro.
const navRowClass =
  "relative flex w-full items-center gap-3 rounded-[7px] px-2.5 py-[12px] text-left text-[13px] text-[#ababab] isolation-isolate transition-[background,color] duration-[180ms] hover:bg-white/[0.035] hover:text-white [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[1.4]";

const navActiveClass =
  "!text-white bg-[linear-gradient(to_right,#080808b3_0%,#08080866_25%,#08080826_55%,transparent_100%),linear-gradient(160deg,#ffbd1626_0%,#ff682f29_22%,#ff165e2b_46%,#ee0de426_73%,#7753ff30_100%)]";

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
      className={cn(
        // font-size, letter-spacing y word-spacing: text-size.ts (.folder-heading).
        "folder-heading group relative flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-[11px] text-left text-[13px] leading-5 text-[#b9b9c2] [overflow-wrap:anywhere]",
        dropActive
          ? [
              "border-transparent text-[#f4edf2] [box-shadow:inset_0_1px_0_#ffffff08,0_0_15px_#d63ab00b] [transition:background_.2s,color_.2s,box-shadow_.2s]",
              "[background:linear-gradient(135deg,#ffb52518_0%,#ff64361b_22%,#f725701c_48%,#d619df18_72%,#6559ef1c_100%),#111113]",
              "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:p-px",
              "after:[background:linear-gradient(135deg,#ffbd1699_0%,#ff682faa_22%,#ff165eaa_46%,#ee0de4aa_73%,#7753ffaa_100%)]",
              "after:[mask-image:linear-gradient(#fff_0_0),linear-gradient(#fff_0_0)] after:[mask-origin:content-box,border-box] after:[mask-clip:content-box,border-box] after:[mask-position:0_0] after:[mask-composite:exclude]",
            ]
          : "hover:bg-[#ffffff06]"
      )}
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

      <span
        className="relative block min-h-5 min-w-0 flex-1 overflow-hidden pr-[22px] leading-[1.5] text-ellipsis whitespace-nowrap"
        title={isRenaming ? undefined : "Doble clic para cambiar el nombre"}
      >
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
              className={renameInputClass}
              aria-label="Nombre de la carpeta"
            />
          </>
        ) : (
          project.name
        )}
      </span>
      {!isRenaming && (
        <span className="ml-auto text-[11px] text-[#72727e] max-md:hidden">{threadCount || ""}</span>
      )}

      {!isRenaming && (
        // Visible con hover/foco de la fila, menú abierto o en táctil.
        <span className="absolute top-1/2 right-2 flex h-5 shrink-0 gap-[3px] opacity-0 [transform:translateY(-50%)] [transition:opacity_.16s_ease] group-focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            ref={moreRef}
            type="button"
            className="folder-more [display:grid] h-5 w-5 place-items-center rounded-[6px] p-0.5 !text-[#92929c] hover:bg-[#ffffff09] hover:!text-[#eee] focus:![outline:none] focus-visible:[box-shadow:inset_0_0_0_1px_#ffffff25]"
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
        <button
          type="button"
          className="menuveil hidden max-[650px]:fixed max-[650px]:inset-0 max-[650px]:z-[9] max-[650px]:block max-[650px]:bg-[#0009]"
          aria-label="Cerrar menú"
          onClick={onCloseSidebar}
        />
      )}

      <aside
        ref={asideRef}
        className={cn(
          // Sin clase `.sidebar`: el dump no debe pintar este panel. Siempre
          // relative (también en móvil), como lo dejaba la cerca.
          "chat-sidebar relative z-30 box-border flex h-full min-h-0 shrink-0 flex-col overflow-hidden",
          "border-r border-white/[0.03] bg-[#111113]",
          "inset-y-0 left-0 md:inset-auto md:translate-x-0",
          // Íconos del panel (no el rim del halo). `!`: legacy aún trae
          // svg{stroke-width} y .app svg.lucide{width:unset}.
          "[&_svg:not(.rim-svg)]:!h-[18px] [&_svg:not(.rim-svg)]:!w-[18px] [&_svg:not(.rim-svg)]:flex-[0_0_18px]",
          "[&_svg:not(.rim-svg)]:fill-none [&_svg:not(.rim-svg)]:stroke-current [&_svg:not(.rim-svg)]:!stroke-[1.4]",
          !collapsed && "min-w-[230px]",
          "transition-[width,padding] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          "motion-reduce:transition-none",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          resizing && "!transition-none",
          collapsed && "pointer-events-none border-r-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        style={
          {
            width: collapsed ? 0 : sidebarWidth,
            "--sidebar-user-width": `${sidebarWidth}px`,
          } as React.CSSProperties
        }
      >
        <div
          className={cn(
            "chat-sidebar-column absolute inset-0 box-border flex min-h-0 min-w-0 flex-col px-5 py-[25px]",
            "transition-transform duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
            "motion-reduce:transition-none",
            resizing && "!transition-none",
            collapsed && "-translate-x-full"
          )}
        >
          {/* brandrow Martin: logo + ‹ hermanos en la misma fila (nunca dentro de #new) */}
          <div className="chat-sidebar-brand relative z-[2] mb-9 flex min-h-[45px] w-full shrink-0 items-start justify-between gap-2 overflow-visible">
            <a
              className="block w-[94px] max-w-[94px] flex-[0_0_94px] overflow-visible leading-[0] text-inherit no-underline"
              href="https://www.skool.com/creativos"
              aria-label={`${communityName} en Skool`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.svg"
                width={94}
                height={25}
                alt={communityName}
                className="relative top-2.5 left-2 block h-[25px] w-[94px] object-fill opacity-100 [filter:none]"
              />
            </a>
            <button
              type="button"
              className={cn(
                // `!`: .grid (catálogo) y button{color;font:inherit} de legacy
                // también tocan este botón. Sin hover de color, como hasta ahora.
                "relative top-2.5 !z-[2] ml-auto grid h-[30px] w-[30px] min-w-[30px] max-w-[30px] flex-[0_0_30px] place-items-center self-start",
                "cursor-pointer [border:0] bg-transparent p-[5px]",
                "!text-[22px] font-normal !leading-none !text-[#666978]",
                "[-webkit-text-fill-color:#666978] opacity-100"
              )}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                document.documentElement.style.setProperty("--panel-toggle-top", `${Math.round(rect.top)}px`);
                onToggleCollapse();
              }}
              aria-label="Contraer panel"
              title="Contraer panel"
            >
              <span
                className="block text-[22px] leading-none text-inherit [-webkit-text-fill-color:inherit] opacity-100"
                aria-hidden
              >
                ‹
              </span>
            </button>
          </div>

          {/* #new a ancho completo; HaloRim absolute (no .tool del dump) */}
          <button
            type="button"
            id="new"
            onClick={onNewChat}
            className={cn(
              "relative z-0 mb-[15px] flex min-h-0 w-full shrink-0 items-center justify-start gap-[13px] overflow-hidden rounded-xl",
              "border border-white/[0.09] bg-[linear-gradient(120deg,#ffffff06,transparent)]",
              "px-3.5 py-[13px] shadow-[inset_0_1px_0_#ffffff06]",
              "hover:border-white/[0.16] hover:bg-white/[0.035] hover:shadow-[0_0_18px_#f04e7110]"
            )}
          >
            <HaloRim id="new-chat" />
            <span className="relative z-[1] flex items-center gap-[13px]">
              ＋ <span>Nuevo chat</span>
            </span>
          </button>
          <label className="relative z-[1] mb-0 flex shrink-0 items-center gap-2.5 rounded-[7px] border border-white/[0.05] bg-white/[0.01] p-2.5 text-[#777b88] [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0">
            <ProtoIcon name="search" />
            <input
              ref={searchRef}
              id="sideSearch"
              value={chatSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar..."
              aria-label="Buscar herramientas"
              className="min-w-0 w-full border-0 bg-transparent text-[13px] text-[#eeeef2] outline-none"
            />
          </label>

          {/* Lista que scrollea: GPTS + Proyectos + CHATS. Pie queda fuera con mt-auto. */}
          <div
            className={cn(
              "chat-sidebar-scroll mt-2 min-h-0 flex-[1_1_auto] overflow-x-hidden overflow-y-auto",
              "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            )}
          >
            <div className={labelClass}>GPTs</div>
            <nav aria-label="GPTs recientes">
              {recentGpts.map((g) => {
                const isActive = activeGptId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectGpt(g.id)}
                    className={cn(navRowClass, isActive && navActiveClass)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <GptGlyph gpt={g} size="xs" variant="nav" />
                    <span className="min-w-0 truncate">{g.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                id="allNav"
                onClick={onOpenAllGpts}
                className={cn(navRowClass, !activeGptId && navActiveClass)}
                aria-current={!activeGptId ? "page" : undefined}
              >
                <ProtoIcon name="grid" />
                <span className="min-w-0 truncate">Todos los GPTs</span>
              </button>
            </nav>

            {groups.length > 0 && (
              <>
                <div className={labelClass}>Proyectos</div>
                <div className="mb-3 space-y-0.5">
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
                          <div className="mt-0.5 space-y-0.5 pl-3">{threads.map(renderThread)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* CHATS siempre visible como Martin; label dentro del bloque con border-top. */}
            <div
              className={cn(
                "mt-[25px] space-y-0.5 rounded-lg border-t border-white/[0.05]",
                dropLoose && "bg-brand/10 ring-1 ring-brand/50"
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
              <div className={labelClass}>Chats</div>
              {looseSorted.map(renderThread)}
              {loose.length === 0 && groups.length > 0 && (
                <p className="px-2.5 py-2 text-[12px] text-zinc-600">
                  Arrastra un chat aquí para sacarlo de su proyecto.
                </p>
              )}
            </div>
          </div>

          <SidebarFooter
            fullName={profile.fullName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
            isAdmin={profile.isAdmin}
          />
        </div>
        <div
          className={cn(
            "sidebar-resizer absolute top-0 -right-1 bottom-0 z-20 h-full w-2 cursor-col-resize touch-none max-md:hidden",
            "after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-px after:bg-[#ffffff00] after:content-['']",
            "after:[transition:background_.2s] hover:after:bg-[#ffffff30] [body.resizing-sidebar_&]:after:bg-[#ffffff30]"
          )}
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
