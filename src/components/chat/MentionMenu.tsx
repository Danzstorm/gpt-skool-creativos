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
 * Autocompletado de adjuntos del hilo al escribir `@`.
 *
 * Presentacional: el Composer decide qué está activo y atrapa Enter antes de
 * enviar el mensaje. Las filas miden 44px para poder elegirlas con el pulgar.
 */
function MentionMenu({ files, activeIndex, query, onPick, onHover }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 border-b border-white/[0.08]">
        Adjuntos de este chat
      </p>

      {files.length === 0 ? (
        <p className="px-3 py-4 text-sm text-zinc-500">
          {query
            ? `Sin resultados para «${query}»`
            : "Todavía no hay imágenes en este hilo. Adjuntá una arriba para referenciarla."}
        </p>
      ) : (
        <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
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
              className={`flex h-11 cursor-pointer items-center gap-2.5 overflow-hidden px-3 ${
                i === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"
              }`}
            >
              {file.kind === "image" && file.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.previewUrl}
                  alt=""
                  className="h-11 w-11 flex-shrink-0 rounded-lg border border-white/[0.08] object-cover"
                />
              ) : (
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                  {file.kind === "video" ? (
                    <Video size={16} className="text-zinc-400" />
                  ) : (
                    <Paperclip size={16} className="text-zinc-400" />
                  )}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-100">{file.token}</span>
                {file.kind === "document" && (
                  <span className="block truncate text-[11px] text-zinc-500">{file.name}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MentionMenu;
