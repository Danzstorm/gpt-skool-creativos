import { memo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { ThreadSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

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
}

function ThreadListItem({
  thread,
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
        "group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer text-[13px] transition",
        isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      )}
      onClick={() => onSelect(thread)}
    >
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
          className="flex-1 bg-zinc-800 rounded-md px-1.5 py-0.5 text-white text-[13px] focus:outline-none"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate">{thread.title}</span>
      )}

      {!isRenaming && (
        <div className="flex md:hidden md:group-hover:flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartRename(thread);
            }}
            className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(thread.id);
            }}
            className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(ThreadListItem);
