import { useCallback } from "react";
import { SquarePen, X } from "lucide-react";
import type { Gpt, ThreadSummary } from "@/lib/types";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

  // Siempre montado abierto: el padre lo desmonta al cerrar. Radix solo pide
  // cerrar (Escape / click fuera); `onClose` decide.
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
          <GptGlyph gpt={gpt} size="lg" />
          <DialogTitle className="flex-1 min-w-0 truncate text-sm font-semibold text-zinc-100">
            {gpt.name}
          </DialogTitle>
          <DialogClose asChild>
            <button
              className="p-1.5 rounded-lg text-zinc-500 hover:text-ink hover:bg-white/[0.06] transition"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </DialogClose>
        </div>

        <div className="p-3">
          <button
            onClick={newChatAndClose}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
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
      </DialogContent>
    </Dialog>
  );
}
