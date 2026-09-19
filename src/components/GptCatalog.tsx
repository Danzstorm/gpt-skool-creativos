"use client";

import { useMemo, useState } from "react";
import type { Gpt } from "@/lib/types";
import GptCard from "./GptCard";
import { GPT_CRAFTS, resolveGptCraft, type GptCraft } from "@/lib/gpt-visual";
import { Search, SearchX } from "lucide-react";

interface Props {
  gpts: Gpt[];
  onSelect: (id: string) => void;
}

const CHIP_BASE =
  "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium border transition cursor-pointer";
const CHIP_ACTIVE = "bg-zinc-100 text-zinc-950 border-transparent";
const CHIP_IDLE =
  "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]";

export default function GptCatalog({ gpts, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [activeCraft, setActiveCraft] = useState<GptCraft | null>(null);

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

  const query = search.trim().toLowerCase();
  const filtered = gpts.filter((g) => {
    const haystack = `${g.name} ${g.description ?? ""} ${g.author ?? ""}`.toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const craft = resolveGptCraft(g.category, g.name, g.description);
    const matchesCraft = !activeCraft || craft === activeCraft;
    return matchesSearch && matchesCraft;
  });

  return (
    <div>
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <label htmlFor="gpt-catalog-search" className="sr-only">
            Buscar GPTs
          </label>
          <input
            id="gpt-catalog-search"
            type="search"
            placeholder="Buscar por nombre o lo que hace"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-11 pr-4 text-base text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-white/20 sm:text-sm"
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-zinc-500">
          <SearchX size={32} className="mb-3 text-zinc-600" aria-hidden />
          <p>No hay GPTs que coincidan con tu búsqueda.</p>
        </div>
      ) : (
        <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {filtered.map((gpt, i) => (
            <GptCard
              key={gpt.id}
              gpt={gpt}
              onSelect={onSelect}
              style={{ animationDelay: `${i * 45}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
