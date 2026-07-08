import { memo, useMemo } from "react";
import { PanelLeftClose, Search, SquarePen } from "lucide-react";
import type { Gpt, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import GptGlyph from "./GptGlyph";
import ThreadListItem from "./ThreadListItem";
import SidebarFooter from "./SidebarFooter";

interface Props {
  gpts: Gpt[];
  threadList: ThreadSummary[];
  activeGptId: string | null;
  activeThreadId: string | null;
  sidebarOpen: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  profile: { fullName: string | null; email: string | null; isAdmin: boolean };
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
}

function ChatSidebar({
  gpts,
  threadList,
  activeGptId,
  activeThreadId,
  sidebarOpen,
  collapsed,
  onToggleCollapse,
  profile,
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
}: Props) {
  const gptById = useMemo(() => new Map(gpts.map((g) => [g.id, g])), [gpts]);

  const filteredThreads = useMemo(() => {
    if (!chatSearch) return threadList;
    const q = chatSearch.toLowerCase();
    return threadList.filter(
      (t) => t.title.toLowerCase().includes(q) || gptById.get(t.gpt_id)?.name.toLowerCase().includes(q)
    );
  }, [threadList, chatSearch, gptById]);

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
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition"
              title="Contraer panel"
              aria-label="Contraer panel"
            >
              <PanelLeftClose size={16} />
            </button>
            <button
              onClick={onNewChat}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition"
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
            <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium px-2.5 pt-1.5 pb-1">
              GPTs
            </p>
            <div className="space-y-0.5 mb-3">
              {gpts.map((g) => (
                <div key={g.id} className="group relative flex items-center">
                  <button
                    onClick={() => onSelectGpt(g.id)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center gap-2 rounded-lg pl-2.5 pr-7 py-1.5 text-[13px] transition text-left",
                      activeGptId === g.id && !activeThreadId
                        ? "bg-zinc-800 text-white"
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
                    className="hidden group-hover:flex items-center justify-center absolute right-1 w-6 h-6 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800"
                    title={`Ver conversaciones de ${g.name}`}
                    aria-label={`Ver conversaciones de ${g.name}`}
                  >
                    <Search size={12} />
                  </button>
                </div>
              ))}
            </div>

            {filteredThreads.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium px-2.5 pt-2 pb-1">
                  Chats
                </p>
                <div className="space-y-0.5">
                  {filteredThreads.map((t) => (
                    <ThreadListItem
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      isRenaming={renamingId === t.id}
                      renameValue={renameValue}
                      onSelect={onSelectThread}
                      onRenameValueChange={onRenameValueChange}
                      onStartRename={onStartRename}
                      onSubmitRename={onSubmitRename}
                      onCancelRename={onCancelRename}
                      onDelete={onDeleteThread}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <SidebarFooter fullName={profile.fullName} email={profile.email} isAdmin={profile.isAdmin} />
        </div>
      </aside>
    </>
  );
}

export default memo(ChatSidebar);
