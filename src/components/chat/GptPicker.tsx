"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SearchX, X } from "lucide-react";
import type { Gpt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { gptMatchesSearch } from "@/lib/gpt-recents";
import { GPT_CRAFTS, getGptVisual, resolveGptCraft, type GptCraft } from "@/lib/gpt-visual";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import GptGlyph from "./GptGlyph";

interface Props {
  gpts: Gpt[];
  activeGptId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}

const CHIP_BASE =
  "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium border transition cursor-pointer";
const CHIP_ACTIVE = "bg-zinc-100 text-zinc-950 border-transparent";
const CHIP_IDLE =
  "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700";

export default function GptPicker({ gpts, activeGptId, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [activeCraft, setActiveCraft] = useState<GptCraft | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const crafts = useMemo(() => {
    const seen = new Set<GptCraft>();
    const order: GptCraft[] = [];
    for (const gpt of gpts) {
      const craft = resolveGptCraft(gpt.category, gpt.name, gpt.description);
      if (craft && !seen.has(craft)) {
        seen.add(craft);
        order.push(craft);
      }
    }
    return order;
  }, [gpts]);

  const filtered = gpts.filter((gpt) => {
    if (!gptMatchesSearch(gpt, search)) return false;
    if (!activeCraft) return true;
    return resolveGptCraft(gpt.category, gpt.name, gpt.description) === activeCraft;
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(80vh,40rem)] max-w-2xl flex-col">
        <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
            Todos los GPTs
          </DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-ink"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </DialogClose>
        </div>

        <div className="space-y-3 border-b border-white/[0.06] px-4 py-3">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
              aria-hidden
            />
            <label htmlFor="gpt-picker-search" className="sr-only">
              Buscar GPTs
            </label>
            <input
              ref={searchRef}
              id="gpt-picker-search"
              type="search"
              placeholder="Buscar por nombre o lo que hace"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-11 pr-4 text-base text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-brand/40 focus:ring-2 focus:ring-brand/20 sm:text-sm"
            />
          </div>

          {crafts.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por oficio">
              <button
                type="button"
                onClick={() => setActiveCraft(null)}
                aria-pressed={!activeCraft}
                className={`${CHIP_BASE} ${!activeCraft ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                Todos
              </button>
              {crafts.map((craft) => (
                <button
                  key={craft}
                  type="button"
                  onClick={() => setActiveCraft(craft === activeCraft ? null : craft)}
                  aria-pressed={activeCraft === craft}
                  className={`${CHIP_BASE} ${activeCraft === craft ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  {GPT_CRAFTS[craft].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-zinc-500">
              <SearchX size={32} className="mb-3 text-zinc-600" aria-hidden />
              <p>No hay GPTs que coincidan con tu búsqueda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map((gpt) => {
                const visual = getGptVisual(gpt.category, gpt.name, gpt.description);
                const isActive = gpt.id === activeGptId;
                return (
                  <button
                    key={gpt.id}
                    type="button"
                    onClick={() => onSelect(gpt.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "gpt-nav flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors active:scale-[0.99]",
                      isActive ? "nav-active text-ink" : "text-zinc-400"
                    )}
                  >
                    <GptGlyph gpt={gpt} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-100">{gpt.name}</span>
                      {visual.label && (
                        <span className="block truncate text-xs text-zinc-500">{visual.label}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
