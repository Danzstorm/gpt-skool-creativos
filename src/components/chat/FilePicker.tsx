"use client";

import { useEffect, useRef } from "react";
import { Paperclip } from "lucide-react";
import type { LibraryFile } from "@/app/api/files/route";

interface Props {
  files: LibraryFile[];
  activeIndex: number;
  loading: boolean;
  query: string;
  onPick: (file: LibraryFile) => void;
  onHover: (index: number) => void;
}

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} sem`;
  return `hace ${Math.floor(days / 30)} meses`;
}

/**
 * Menú de la biblioteca de archivos, el que se abre al escribir `@`.
 *
 * Presentacional: no busca ni decide qué está activo, solo pinta. El estado y
 * el teclado viven en el Composer, que es quien tiene el textarea y por lo
 * tanto quien puede interceptar Enter antes de que envíe el mensaje.
 *
 * Las imágenes se muestran con miniatura porque el nombre no sirve para
 * reconocerlas: la mitad se llama IMG_2039.jpg o peor.
 */
function FilePicker({ files, activeIndex, loading, query, onPick, onHover }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  // Mantiene visible el elemento activo al moverse con las flechas: sin esto,
  // navegar más allá del quinto archivo mueve la selección fuera de la vista y
  // parece que el menú dejó de responder.
  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-20">
      <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
        Tus archivos
      </p>

      {loading ? (
        <p className="px-3 py-4 text-sm text-zinc-500">Buscando…</p>
      ) : files.length === 0 ? (
        <p className="px-3 py-4 text-sm text-zinc-500">
          {query ? `Sin resultados para «${query}»` : "Todavía no subiste ningún archivo."}
        </p>
      ) : (
        <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
          {files.map((file, i) => (
            <li
              key={file.openai_file_id}
              role="option"
              aria-selected={i === activeIndex}
              // onMouseDown y no onClick: el click quita el foco del textarea
              // antes de disparar, y perder el foco cierra el menú, así que con
              // onClick el archivo nunca llegaba a elegirse.
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(file);
              }}
              onMouseEnter={() => onHover(i)}
              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer ${
                i === activeIndex ? "bg-zinc-800" : ""
              }`}
            >
              {file.type === "image" && file.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.previewUrl}
                  alt=""
                  className="w-8 h-8 object-cover rounded flex-shrink-0 border border-zinc-700"
                />
              ) : (
                <span className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <Paperclip size={14} className="text-zinc-400" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-200">{file.name}</span>
                <span className="block text-[11px] text-zinc-500">
                  {relativeDate(file.created_at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default FilePicker;
