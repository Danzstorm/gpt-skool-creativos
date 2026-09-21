"use client";

import { useMemo, useState } from "react";
import type { Gpt } from "@/lib/types";
import GptCard from "./GptCard";
import { resolveGptCraft, type GptCraft } from "@/lib/gpt-visual";
import { gptMatchesSearch } from "@/lib/gpt-recents";
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

  const available = useMemo(() => {
    return FILTERS.filter((filter) => {
      if (filter.id === "Todos") return true;
      return gpts.some((g) => {
        const craft = resolveGptCraft(g.category, g.name, g.description);
        return craft != null && filter.crafts.includes(craft);
      });
    });
  }, [gpts]);

  const filtered = gpts.filter((g) => {
    if (!gptMatchesSearch(g, search)) return false;
    if (active === "Todos") return true;
    const craft = resolveGptCraft(g.category, g.name, g.description);
    const filter = FILTERS.find((f) => f.id === active);
    return craft != null && !!filter && filter.crafts.includes(craft);
  });

  return (
    <section className="tools">
      <div className="tools-toolbar">
        <div className="filters" aria-label="Filtrar herramientas">
          {available.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className="filter"
              aria-pressed={active === filter.id}
              onClick={() => setActive(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="search">
          <ProtoIcon name="search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar herramienta"
            aria-label="Buscar herramienta"
          />
        </label>
      </div>
      <div className="grid" aria-live="polite">
        {filtered.length === 0 ? (
          <div className="empty">No hay GPTs que coincidan con tu búsqueda.</div>
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
