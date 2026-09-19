"use client";

import { useEffect, useRef } from "react";
import {
  mentionChipLabel,
  mentionMenuColumns,
  type MentionCandidate,
} from "@/lib/attachment-mentions";
import AttachmentStill from "./AttachmentStill";

interface Props {
  files: MentionCandidate[];
  activeIndex: number;
  query: string;
  onPick: (file: MentionCandidate) => void;
  onHover: (index: number) => void;
  onPreview: (el: HTMLElement, token: string) => void;
  onPreviewEnd: () => void;
}

function secondaryName(file: MentionCandidate): string | null {
  const name = file.name.trim();
  if (!name) return null;
  const label = mentionChipLabel(file.token);
  if (name.localeCompare(label, undefined, { sensitivity: "accent" }) === 0) return null;
  if (/^(imagen|video|archivo)(\.\w+)?$/i.test(name)) return null;
  return name;
}

/**
 * Picker visual al escribir `@`: stills grandes de ESTE hilo.
 * Vive FUERA del .frost del composer — backdrop-filter recortaba la grilla
 * y solo asomaba una pastilla con el rótulo. El tamaño está en CSS explícito.
 */
function MentionMenu({
  files,
  activeIndex,
  query,
  onPick,
  onHover,
  onPreview,
  onPreviewEnd,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const columns = mentionMenuColumns(files.length);

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      className={`mention-menu${columns === 1 ? " mention-menu--single" : ""}`}
      onMouseLeave={onPreviewEnd}
    >
      {files.length === 0 ? (
        <p className="mention-menu-empty">
          {query
            ? `Sin resultados para «${query}»`
            : "Todavía no hay adjuntos en este hilo."}
        </p>
      ) : (
        <ul
          ref={listRef}
          role="listbox"
          className={`mention-menu-grid${columns === 1 ? " mention-menu-grid--single" : ""}`}
        >
          {files.map((file, i) => {
            const label = mentionChipLabel(file.token);
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
                onMouseEnter={(e) => {
                  onHover(i);
                  onPreview(e.currentTarget, file.token);
                }}
                onFocus={(e) => {
                  onHover(i);
                  onPreview(e.currentTarget, file.token);
                }}
                className={`mention-menu-card${selected ? " mention-menu-card--active" : ""}`}
              >
                <span className="mention-menu-still">
                  <AttachmentStill file={file} iconSize={36} />
                </span>
                <span className="mention-menu-meta">
                  <span className="mention-menu-label">{label}</span>
                  {extra ? <span className="mention-menu-extra">{extra}</span> : null}
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
