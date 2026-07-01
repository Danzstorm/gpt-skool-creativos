import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Gpt } from "@/lib/types";
import ChatInterface from "@/components/ChatInterface";
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

  // GPT y lista de conversaciones en paralelo (una sola espera en vez de dos)
  const [{ data: gpt }, { data: threads }] = await Promise.all([
    supabase.from("gpts_public").select("*").eq("id", gptId).single(),
    supabase
      .from("threads")
      .select("id, title, created_at, updated_at")
      .eq("gpt_id", gptId)
      .order("updated_at", { ascending: false }),
  ]);

  if (!gpt) notFound();

  let activeThread = requestedThreadId
    ? threads?.find((t) => t.id === requestedThreadId)
    : threads?.[0];

  // Sin conversaciones aún: creamos una vacía (única llamada a OpenAI que queda en SSR)
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

  // El historial NO se carga en el server: la interfaz pinta al instante y
  // ChatInterface trae los mensajes en cliente (con skeleton) si la conversación
  // ya tuvo actividad. Evita bloquear el primer render esperando a OpenAI.
  return (
    <ChatInterface
      gpt={gpt as Gpt}
      threads={threads ?? [activeThread]}
      activeThreadId={activeThread.id}
      initialMessages={[]}
    />
  );
}
