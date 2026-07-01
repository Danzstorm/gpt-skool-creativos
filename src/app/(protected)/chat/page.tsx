import { createClient } from "@/lib/supabase/server";
import type { Gpt, ThreadSummary } from "@/lib/types";
import UnifiedChat from "@/components/UnifiedChat";

interface Props {
  searchParams: Promise<{ c?: string; gpt?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const { c: threadId, gpt: gptId } = await searchParams;
  const supabase = await createClient();

  // GPTs disponibles + todas las conversaciones del usuario (cross-GPT), en paralelo
  const [{ data: gpts }, { data: threads }] = await Promise.all([
    supabase.from("gpts_public").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("threads")
      .select("id, title, gpt_id, created_at, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <UnifiedChat
      gpts={(gpts as Gpt[]) ?? []}
      threads={(threads as ThreadSummary[]) ?? []}
      initialThreadId={threadId ?? null}
      initialGptId={gptId ?? null}
    />
  );
}
