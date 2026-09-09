import { createClient } from "@/lib/supabase/server";
import type { Gpt, ThreadSummary } from "@/lib/types";
import UnifiedChat from "@/components/UnifiedChat";

interface Props {
  searchParams: Promise<{ c?: string; gpt?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const { c: threadId, gpt: gptId } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // GPTs disponibles + conversaciones del usuario + su perfil (nombre/admin
  // para el footer del sidebar), en paralelo
  const [{ data: gpts }, { data: threads }, { data: profile }] = await Promise.all([
    supabase.from("gpts_public").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("threads")
      .select("id, title, gpt_id, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    user
      ? supabase.from("profiles").select("full_name, is_admin, theme").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <UnifiedChat
      key={threadId ?? gptId ?? "new"}
      gpts={(gpts as Gpt[]) ?? []}
      threads={(threads as ThreadSummary[]) ?? []}
      initialThreadId={threadId ?? null}
      initialGptId={gptId ?? null}
      // Sin key de Gemini el video no se puede describir: la UI no lo ofrece y
      // /api/upload/sign lo rechaza antes de firmar la subida.
      videoEnabled={!!process.env.GEMINI_API_KEY}
      profile={{
        fullName: profile?.full_name ?? null,
        email: user?.email ?? null,
        isAdmin: profile?.is_admin ?? false,
        theme: profile?.theme ?? "violeta",
      }}
    />
  );
}
