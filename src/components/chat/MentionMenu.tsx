"use client";

import { useEffect, useRef } from "react";
import type { MentionCandidate } from "@/lib/attachment-mentions";
import AttachmentStill from "./AttachmentStill";

interface Props {
  files: MentionCandidate[];
  activeIndex: number;
  query: string;
  onPick: (file: MentionCandidate) => void;
  onHover: (index: number) => void;
}

function secondaryName(file: MentionCandidate): string | null {
  const name = file.name.trim();
  if (!name) return null;
  const label = file.token.replace(/^@/, "");
  if (name.localeCompare(label, undefined, { sensitivity: "accent" }) === 0) return null;
  if (/^(imagen|video|archivo)(\.\w+)?$/i.test(name)) return null;
  return name;
}

/**
 * Grilla visual al escribir `@`: stills grandes de ESTE hilo.
 * El Composer atrapa Enter antes de enviar.
 */
function MentionMenu({ files, activeIndex, query, onPick, onHover }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="absolute bottom-full left-0 z-20 mb-1.5 w-[20.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
      {files.length === 0 ? (
        <p className="px-3 py-3 text-sm leading-normal text-zinc-500">
          {query
            ? `Sin resultados para «${query}»`
            : "Todavía no hay adjuntos en este hilo."}
        </p>
      ) : (
        <ul
          ref={listRef}
          role="listbox"
          className="grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto p-1.5"
        >
          {files.map((file, i) => {
            const label = file.token.replace(/^@/, "");
            const extra = secondaryName(file);
            const selected = i === activeIndex;
            return (
              <li
                key={file.id}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(file);
                }}
                onMouseEnter={() => onHover(i)}
                className={`flex cursor-pointer flex-col overflow-hidden rounded-xl ${
                  selected ? "bg-white/[0.10] ring-1 ring-white/15" : "hover:bg-white/[0.05]"
                }`}
              >
                <span className="aspect-square w-full overflow-hidden bg-zinc-900">
                  <AttachmentStill
                    file={file}
                    className="h-full w-full object-cover"
                    iconSize={28}
                  />
                </span>
                <span className="min-w-0 px-1.5 pb-1.5 pt-1">
                  <span className="block truncate text-xs font-medium leading-tight text-zinc-100">
                    {label}
                  </span>
                  {extra ? (
                    <span className="mt-0.5 block truncate text-[11px] leading-tight text-zinc-500">
                      {extra}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default MentionMenu;
