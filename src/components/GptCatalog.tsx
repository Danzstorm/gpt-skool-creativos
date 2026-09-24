"use client";

import { useMemo, useState } from "react";
import type { Gpt } from "@/lib/types";
import GptCard from "./GptCard";
import { resolveGptCraft, type GptCraft } from "@/lib/gpt-visual";
import { activeGptsForChat } from "@/lib/gpt-catalog";
import { gptMatchesSearch } from "@/lib/gpt-recents";
import { cn } from "@/lib/utils";
import ProtoIcon from "./chat/ProtoIcon";

interface Props {
  gpts: Gpt[];
  onSelect: (id: string) => void;
  onPreview?: (accent: string | null) => void;
}

const FILTERS: { id: "Todos" | GptCraft | "images"; label: string; crafts: Array<GptCraft | null> }[] = [
  { id: "Todos", label: "Todos", crafts: [] },
  { id: "video", label: "Video", crafts: ["video"] },
  { id: "images", label: "Imagen", crafts: ["images", "photo"] },
  { id: "characters", label: "Personajes", crafts: ["characters"] },
  { id: "locations", label: "Locaciones", crafts: ["locations"] },
];

export default function GptCatalog({ gpts, onSelect, onPreview }: Props) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<(typeof FILTERS)[number]["id"]>("Todos");
  const catalog = useMemo(() => activeGptsForChat(gpts), [gpts]);

  const available = useMemo(() => {
    return FILTERS.filter((filter) => {
      if (filter.id === "Todos") return true;
      return catalog.some((g) => {
        const craft = resolveGptCraft(g.category, g.name, g.description);
        return craft != null && filter.crafts.includes(craft);
      });
    });
  }, [catalog]);

  const filtered = catalog.filter((g) => {
    if (!gptMatchesSearch(g, search)) return false;
    if (active === "Todos") return true;
    const craft = resolveGptCraft(g.category, g.name, g.description);
    const filter = FILTERS.find((f) => f.id === active);
    return craft != null && !!filter && filter.crafts.includes(craft);
  });

  return (
    <section className="tools relative h-auto max-h-none shrink-0 overflow-visible rounded-[19px] border border-transparent bg-none p-[27px] pb-0 [backdrop-filter:none] max-[900px]:p-[22px] max-[900px]:pb-0 max-[650px]:px-[14px] max-[650px]:py-[19px] max-[650px]:pb-0">
      <div className="tools-toolbar relative z-[1] mb-[24px] flex items-center justify-between gap-[20px] max-[900px]:flex-wrap max-[900px]:gap-[12px] max-[650px]:gap-[14px]">
        <div className="filters relative z-[1] m-0 flex flex-wrap gap-[7px] max-[650px]:gap-0" aria-label="Filtrar herramientas">
          {available.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={cn(
                "filter rounded-[6px] !border !border-transparent !bg-none px-[15px] py-[8px] text-[12px] !text-[#a0a0a0] ![transition:all_.25s_ease] max-[650px]:px-[10px] max-[650px]:text-[11px]",
                active === filter.id
                  ? "!border-[#ed4f7025] !bg-[#ed4f7014] !text-[#ff9ab0] !shadow-[inset_0_1px_0_#ffffff05]"
                  : "hover:!bg-[#ffffff05] hover:!text-[#eee]",
              )}
              aria-pressed={active === filter.id}
              onClick={() => setActive(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="search ml-0 flex w-[205px] shrink-0 items-center gap-[10px] rounded-[8px] border border-[#ffffff09] bg-[#ffffff02] px-[12px] py-[9px] text-[#999] max-[900px]:ml-auto max-[650px]:w-full">
          <ProtoIcon name="search" className="!h-[15px] !w-[15px]" />
          <input
            className="w-full min-w-0 border-none bg-none text-[13px] text-[var(--text)] outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar herramienta"
            aria-label="Buscar herramienta"
          />
        </label>
      </div>
      <div className="grid relative z-[1] h-auto max-h-none shrink-0 auto-rows-[minmax(142px,auto)] grid-cols-3 gap-[12px] overflow-visible [align-content:start] min-[1450px]:auto-rows-[minmax(155px,auto)] max-[900px]:grid-cols-2 max-[650px]:auto-rows-[minmax(150px,auto)] max-[650px]:gap-[9px]" aria-live="polite">
        {filtered.length === 0 ? (
          <div className="empty col-span-full row-[1/-1] px-[20px] py-[60px] text-center text-[#a1a3b0]">No hay GPTs que coincidan con tu búsqueda.</div>
        ) : (
          filtered.map((gpt, i) => (
            <GptCard
              key={gpt.id}
              gpt={gpt}
              onSelect={onSelect}
              onPreview={onPreview}
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))
        )}
      </div>
    </section>
  );
}
