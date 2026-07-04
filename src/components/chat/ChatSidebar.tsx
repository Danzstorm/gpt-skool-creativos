import { memo, useMemo } from "react";
import { MessageSquarePlus } from "lucide-react";
import type { Gpt, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import GptGlyph from "./GptGlyph";
import ThreadListItem from "./ThreadListItem";

const GROUP_ORDER = ["Hoy", "Ayer", "Últimos 7 días", "Anteriores"] as const;

function groupLabel(dateStr: string): (typeof GROUP_ORDER)[number] {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays <= 7) return "Últimos 7 días";
  return "Anteriores";
}

interface Props {
  gpts: Gpt[];
  threadList: ThreadSummary[];
  activeGptId: string | null;
  activeThreadId: string | null;
  sidebarOpen: boolean;
  chatSearch: string;
  onSearchChange: (value: string) => void;
  onSelectGpt: (gptId: string) => void;
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
}

function ChatSidebar({
  gpts,
  threadList,
  activeGptId,
  activeThreadId,
  sidebarOpen,
  chatSearch,
  onSearchChange,
  onSelectGpt,
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
}: Props) {
  const gptById = useMemo(() => new Map(gpts.map((g) => [g.id, g])), [gpts]);

  const groups = useMemo(() => {
    const filtered = threadList.filter(
      (t) =>
        !chatSearch ||
        t.title.toLowerCase().includes(chatSearch.toLowerCase()) ||
        gptById.get(t.gpt_id)?.name.toLowerCase().includes(chatSearch.toLowerCase())
    );
    const byGroup = new Map<string, ThreadSummary[]>();
    for (const t of filtered) {
      const label = groupLabel(t.updated_at);
      if (!byGroup.has(label)) byGroup.set(label, []);
      byGroup.get(label)!.push(t);
    }
    return GROUP_ORDER.map((label) => ({ label, threads: byGroup.get(label) ?? [] })).filter(
      (g) => g.threads.length > 0
    );
  }, [threadList, chatSearch, gptById]);

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 top-[57px] bg-black/50 z-20 md:hidden"
          onClick={onCloseSidebar}
        />
      )}

      <aside
        className={cn(
          "w-64 flex-col border-r border-zinc-800/80 bg-zinc-950 z-30",
          "md:flex md:relative md:translate-x-0",
          "fixed top-[57px] bottom-0 left-0 flex transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-3">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/70 hover:border-zinc-600 text-zinc-100 text-sm font-medium rounded-xl px-3 py-2.5 transition"
          >
            <MessageSquarePlus size={16} />
            Nuevo chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p className="text-[11px] uppercase tracking-wider text-zinc-600 font-medium px-3 pt-2 pb-1.5">
            GPTs
          </p>
          <div className="space-y-0.5 mb-3">
            {gpts.map((g) => (
              <button
                key={g.id}
                onClick={() => onSelectGpt(g.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition text-left",
                  activeGptId === g.id && !activeThreadId
                    ? "bg-violet-600/15 text-white border border-violet-500/20"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent"
                )}
              >
                <GptGlyph gpt={g} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
          </div>

          {threadList.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wider text-zinc-600 font-medium px-3 pt-2 pb-1.5">
                Chats
              </p>
              {threadList.length > 6 && (
                <input
                  value={chatSearch}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Buscar conversación o GPT..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/40 mb-1.5"
                />
              )}
              {groups.map((group) => (
                <div key={group.label} className="mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-700 font-medium px-3 pt-1.5 pb-1">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.threads.map((t) => (
                      <ThreadListItem
                        key={t.id}
                        thread={t}
                        gpt={gptById.get(t.gpt_id)}
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
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default memo(ChatSidebar);
