import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Gpt } from "@/lib/types";
import ChatInterface from "@/components/ChatInterface";
import type { Message } from "@/components/ChatInterface";
import { getThreadMessages } from "@/lib/openai-messages";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Props {
  params: Promise<{ gptId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function ChatPage({ params, searchParams }: Props) {
  const { gptId } = await params;
  const { t: requestedThreadId } = await searchParams;
  const supabase = await createClient();

  const { data: gpt } = await supabase
    .from("gpts_public")
    .select("*")
    .eq("id", gptId)
    .single();

  if (!gpt) notFound();

  const { data: threads } = await supabase
    .from("threads")
    .select("id, title, created_at, updated_at")
    .eq("gpt_id", gptId)
    .order("updated_at", { ascending: false });

  let activeThread = requestedThreadId
    ? threads?.find((t) => t.id === requestedThreadId)
    : threads?.[0];

  if (!activeThread) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const openaiThread = await openai.beta.threads.create();
    const { data: newThread } = await supabase
      .from("threads")
      .insert({ user_id: user!.id, gpt_id: gptId, openai_thread_id: openaiThread.id })
      .select("id, title, created_at, updated_at")
      .single();

    activeThread = newThread!;
    threads?.unshift(activeThread);
  }

  const { data: activeThreadRow } = await supabase
    .from("threads")
    .select("openai_thread_id")
    .eq("id", activeThread.id)
    .single();

  let initialMessages: Message[] = [];
  if (activeThreadRow?.openai_thread_id) {
    try {
      initialMessages = await getThreadMessages(activeThreadRow.openai_thread_id);
    } catch {
      // historial no disponible, empieza vacío
    }
  }

  return (
    <ChatInterface
      gpt={gpt as Gpt}
      threads={threads ?? [activeThread]}
      activeThreadId={activeThread.id}
      initialMessages={initialMessages}
    />
  );
}
