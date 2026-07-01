import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Gpt } from "@/lib/types";
import ChatInterface from "@/components/ChatInterface";
import type { Message } from "@/components/ChatInterface";
import OpenAI from "openai";

interface Props {
  params: Promise<{ gptId: string }>;
}

export default async function ChatPage({ params }: Props) {
  const { gptId } = await params;
  const supabase = await createClient();

  const { data: gpt } = await supabase
    .from("gpts_public")
    .select("*")
    .eq("id", gptId)
    .single();

  if (!gpt) notFound();

  const { data: thread } = await supabase
    .from("threads")
    .select("openai_thread_id")
    .eq("gpt_id", gptId)
    .single();

  let initialMessages: Message[] = [];

  if (thread?.openai_thread_id) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const { data: oaiMessages } = await openai.beta.threads.messages.list(
        thread.openai_thread_id,
        { order: "asc", limit: 100 }
      );

      initialMessages = oaiMessages
        .map((msg) => {
          const text = msg.content
            .filter((c) => c.type === "text")
            .map((c) => (c.type === "text" ? c.text.value : ""))
            .join("\n");
          return { role: msg.role as "user" | "assistant", content: text };
        })
        .filter((m) => m.content.trim().length > 0);
    } catch {
      // historial no disponible, empieza vacío
    }
  }

  return (
    <ChatInterface
      gpt={gpt as Gpt}
      initialThreadId={thread?.openai_thread_id ?? null}
      initialMessages={initialMessages}
    />
  );
}
