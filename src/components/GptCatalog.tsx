"use client";

import { useState } from "react";
import type { Gpt } from "@/lib/types";
import GptCard from "./GptCard";
import { Search } from "lucide-react";

interface Props {
  gpts: Gpt[];
  categories: string[];
}

export default function GptCatalog({ gpts, categories }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = gpts.filter((g) => {
    const matchesSearch =
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      !activeCategory || g.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="text"
            placeholder="Buscar GPTs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 focus:bg-zinc-900 transition text-sm"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition ${
              !activeCategory
                ? "bg-violet-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
                : "bg-zinc-900/70 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() =>
                setActiveCategory(cat === activeCategory ? null : cat)
              }
              className={`px-3.5 py-2 rounded-xl text-sm font-medium transition ${
                activeCategory === cat
                  ? "bg-violet-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
                  : "bg-zinc-900/70 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">🔍</div>
          <p>No hay GPTs que coincidan con tu búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((gpt) => (
            <GptCard key={gpt.id} gpt={gpt} />
          ))}
        </div>
      )}
    </div>
  );
}
