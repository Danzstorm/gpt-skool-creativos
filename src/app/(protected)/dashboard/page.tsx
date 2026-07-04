import { createClient } from "@/lib/supabase/server";
import type { Gpt } from "@/lib/types";
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
        <h1 className="font-display text-4xl font-medium tracking-tight text-stone-50">
          GPTs Creativos
        </h1>
        <p className="mt-2 text-stone-400">
          Herramientas de IA exclusivas para la comunidad
        </p>
      </div>

      <GptCatalog gpts={(gpts as Gpt[]) ?? []} categories={categories} />
    </div>
  );
}
