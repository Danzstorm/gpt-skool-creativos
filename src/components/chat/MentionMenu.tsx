"use client";

import { useEffect, useRef } from "react";
import { Paperclip, Video } from "lucide-react";
import type { MentionCandidate } from "@/lib/attachment-mentions";

interface Props {
  files: MentionCandidate[];
  activeIndex: number;
  query: string;
  onPick: (file: MentionCandidate) => void;
  onHover: (index: number) => void;
}

/**
 * Lista mínima al escribir `@`: Imagen 1…N de este hilo.
 * El Composer atrapa Enter antes de enviar. Filas 44px para el pulgar.
 */
function MentionMenu({ files, activeIndex, query, onPick, onHover }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="absolute bottom-full left-0 z-20 mb-1.5 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      {files.length === 0 ? (
        <p className="px-3 py-3 text-sm leading-normal text-zinc-500">
          {query
            ? `Sin resultados para «${query}»`
            : "Todavía no hay adjuntos en este hilo."}
        </p>
      ) : (
        <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
          {files.map((file, i) => (
            <li
              key={file.id}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(file);
              }}
              onMouseEnter={() => onHover(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3 ${
                i === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
              }`}
            >
              {file.kind === "image" && file.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.previewUrl}
                  alt=""
                  className="h-5 w-5 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  {file.kind === "video" ? (
                    <Video size={14} className="text-zinc-500" />
                  ) : (
                    <Paperclip size={14} className="text-zinc-500" />
                  )}
                </span>
              )}
              <span className="min-w-0 truncate text-sm leading-normal text-zinc-200">
                {file.token.replace(/^@/, "")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MentionMenu;
