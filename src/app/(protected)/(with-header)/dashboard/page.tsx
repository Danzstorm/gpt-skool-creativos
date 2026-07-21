import { createClient } from "@/lib/supabase/server";
import type { Gpt } from "@/lib/types";
import GptCatalog from "@/components/GptCatalog";

// Motivos por los que /admin puede devolver a alguien aquí. Sin esto, quien
// intenta entrar al panel aterriza en el catálogo sin una palabra y no sabe si
// le falta el permiso o si algo se rompió.
const NOTICES: Record<string, string> = {
  profile_pending:
    "Tu perfil todavía se está creando. Vuelve a intentar entrar al panel en unos segundos.",
  not_admin: "No tienes permisos de administrador en esta comunidad.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : null;

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
      {notice && (
        <div className="mb-6 rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200/90">
          {notice}
        </div>
      )}
      <div className="mb-8">
        <h1 className="font-display text-4xl font-medium tracking-tight text-zinc-50">
          GPTs Creativos
        </h1>
        <p className="mt-2 text-zinc-400">
          Herramientas de IA exclusivas para la comunidad
        </p>
      </div>

      <GptCatalog gpts={(gpts as Gpt[]) ?? []} categories={categories} />
    </div>
  );
}
