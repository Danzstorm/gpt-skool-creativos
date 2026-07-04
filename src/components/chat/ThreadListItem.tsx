import { memo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Gpt, ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import GptGlyph from "./GptGlyph";

interface Props {
  thread: ThreadSummary;
  gpt?: Gpt;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: (thread: ThreadSummary) => void;
  onRenameValueChange: (value: string) => void;
  onStartRename: (thread: ThreadSummary) => void;
  onSubmitRename: (id: string) => void;
  onCancelRename: () => void;
  onDelete: (id: string) => void;
}

function ThreadListItem({
  thread,
  gpt,
  isActive,
  isRenaming,
  renameValue,
  onSelect,
  onRenameValueChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDelete,
}: Props) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer text-sm transition",
        isActive
          ? "bg-violet-600/15 text-white border border-violet-500/20"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent"
      )}
      onClick={() => onSelect(thread)}
    >
      <GptGlyph gpt={gpt} />
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmitRename(thread.id);
            if (e.key === "Escape") onCancelRename();
          }}
          onBlur={() => onSubmitRename(thread.id)}
          className="flex-1 bg-zinc-800 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
        />
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{thread.title}</span>
            {gpt && (
              <span className="text-[10px] text-zinc-600 truncate flex-shrink-0 hidden lg:inline">
                {gpt.name}
              </span>
            )}
          </div>
          {thread.last_message_preview && (
            <p className="text-xs text-zinc-600 truncate">{thread.last_message_preview}</p>
          )}
        </div>
      )}

      {!isRenaming && (
        <div className="flex md:hidden md:group-hover:flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartRename(thread);
            }}
            className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(thread.id);
            }}
            className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(ThreadListItem);
