import { memo, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  PanelLeftClose,
  Pencil,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { Gpt, Project, ThreadSummary, Theme } from "@/lib/types";
import { cn } from "@/lib/utils";
import { groupThreadsByProject } from "@/lib/project-grouping";
import GptGlyph from "./GptGlyph";
import ThreadListItem, { THREAD_DND_TYPE } from "./ThreadListItem";
import SidebarFooter from "./SidebarFooter";

interface Props {
  gpts: Gpt[];
  threadList: ThreadSummary[];
  projects: Project[];
  openProjectIds: string[];
  activeGptId: string | null;
  activeThreadId: string | null;
  sidebarOpen: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  profile: { fullName: string | null; email: string | null; isAdmin: boolean };
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  chatSearch: string;
  onSearchChange: (value: string) => void;
  onSelectGpt: (gptId: string) => void;
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
  theme,
  onThemeChange,
  chatSearch,
  onSearchChange,
  onSelectGpt,
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
          "flex-col border-r border-zinc-800/80 bg-zinc-950 z-30 overflow-hidden",
          "md:flex md:relative md:translate-x-0 transition-[width] duration-200 ease-out",
          collapsed ? "md:w-0 md:border-r-0" : "md:w-64",
          "fixed top-0 bottom-0 left-0 flex w-64 transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="w-64 h-full flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-2 pt-2 pb-1">
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-ink hover:bg-zinc-900 transition"
              title="Contraer panel"
              aria-label="Contraer panel"
            >
              <PanelLeftClose size={16} />
            </button>
            <button
              onClick={onNewChat}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-ink hover:bg-zinc-900 transition"
              title="Nuevo chat"
              aria-label="Nuevo chat"
            >
              <SquarePen size={16} />
            </button>
          </div>

          <div className="px-2 pb-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                value={chatSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-lg pl-7 pr-2.5 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <p className="text-[11px] uppercase tracking-wider text-zinc-600 font-medium px-2.5 pt-1.5 pb-1">
              GPTs
            </p>
            <div className="space-y-0.5 mb-3">
              {gpts.map((g) => (
                <div key={g.id} className="group relative flex items-center">
                  <button
                    onClick={() => onSelectGpt(g.id)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center gap-2 rounded-lg pl-2.5 pr-7 py-1.5 text-[13px] transition text-left cursor-pointer active:scale-[0.99]",
                      activeGptId === g.id && !activeThreadId
                        ? "bg-active text-ink"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
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
              ))}
            </div>

            {groups.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-wider text-zinc-600 font-medium px-2.5 pt-2 pb-1">
                  Proyectos
                </p>
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
                            "group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer text-[13px] transition text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                            dropProjectId === project.id && "ring-1 ring-violet-500/70 bg-violet-500/10"
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
                              <span className="text-[11px] text-zinc-600 group-hover:hidden">
                                {threads.length || ""}
                              </span>
                            </>
                          )}

                          {!isRenamingProject && (
                            <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
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

            {loose.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-wider text-zinc-600 font-medium px-2.5 pt-2 pb-1">
                  Chats
                </p>
                <div className="space-y-0.5">{loose.map(renderThread)}</div>
              </>
            )}
          </div>

          <SidebarFooter
            fullName={profile.fullName}
            email={profile.email}
            isAdmin={profile.isAdmin}
            theme={theme}
            onThemeChange={onThemeChange}
          />
        </div>
      </aside>
    </>
  );
}

export default memo(ChatSidebar);
