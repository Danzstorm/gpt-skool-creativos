import { createClient } from "@/lib/supabase/server";
import type { Gpt } from "@/lib/types";
import GptCard from "@/components/GptCard";
import GptCatalog from "@/components/GptCatalog";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: gpts } = await supabase
    .from("gpts_public")
    .select("*")
    .order("sort_order", { ascending: true });

  const categories = Array.from(
    new Set((gpts ?? []).map((g: Gpt) => g.category).filter(Boolean))
  ) as string[];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">GPTs Creativos</h1>
        <p className="text-zinc-400 mt-1.5">
          Herramientas de IA exclusivas para la comunidad
        </p>
      </div>

      <GptCatalog gpts={(gpts as Gpt[]) ?? []} categories={categories} />
    </div>
  );
}
