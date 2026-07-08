import { useCallback } from "react";
import { SquarePen, X } from "lucide-react";
import type { Gpt, ThreadSummary } from "@/lib/types";
import { useDismissable } from "@/lib/useDismissable";
import GptGlyph from "./GptGlyph";
import ThreadListItem from "./ThreadListItem";

interface Props {
  gpt: Gpt;
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onClose: () => void;
  onSelectThread: (thread: ThreadSummary) => void;
  onNewChat: () => void;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onStartRename: (thread: ThreadSummary) => void;
  onSubmitRename: (id: string) => void;
  onCancelRename: () => void;
  onDeleteThread: (id: string) => void;
}

export default function GptChatsModal({
  gpt,
  threads,
  activeThreadId,
  onClose,
  onSelectThread,
  onNewChat,
  renamingId,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDeleteThread,
}: Props) {
  const panelRef = useDismissable<HTMLDivElement>(true, onClose);

  const selectAndClose = useCallback(
    (t: ThreadSummary) => {
      onSelectThread(t);
      onClose();
    },
    [onSelectThread, onClose]
  );

  const newChatAndClose = useCallback(() => {
    onNewChat();
    onClose();
  }, [onNewChat, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        className="w-full max-w-md max-h-[80vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-800/80">
          <GptGlyph gpt={gpt} size="lg" />
          <h2 className="flex-1 min-w-0 truncate text-sm font-semibold text-zinc-100">{gpt.name}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={newChatAndClose}
            className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/70 hover:border-zinc-600 text-zinc-100 text-sm font-medium rounded-xl px-3 py-2 transition"
          >
            <SquarePen size={15} />
            Nuevo chat con {gpt.name}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {threads.length === 0 ? (
            <p className="text-center text-sm text-zinc-600 py-8">Aún no hay conversaciones con este GPT.</p>
          ) : (
            threads.map((t) => (
              <ThreadListItem
                key={t.id}
                thread={t}
                isActive={t.id === activeThreadId}
                isRenaming={renamingId === t.id}
                renameValue={renameValue}
                onSelect={selectAndClose}
                onRenameValueChange={onRenameValueChange}
                onStartRename={onStartRename}
                onSubmitRename={onSubmitRename}
                onCancelRename={onCancelRename}
                onDelete={onDeleteThread}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
