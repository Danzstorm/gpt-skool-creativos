import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/types";

// El historial vive en la tabla local `messages` (caché instantánea, poblada
// en cada turno y, para conversaciones previas a la migración a Responses API,
// por el backfill de scripts/backfill-thread-messages.ts). El contexto que el
// modelo usa vive en la Conversation de OpenAI; esta tabla es solo para la UI.
export async function getThreadMessages(
  supabase: SupabaseClient,
  threadId: string
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, files")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((m) => {
    const rawFiles =
      (m.files as Array<{
        openai_file_id: string;
        type: "image" | "document" | "video" | "audio";
        name?: string;
        n?: number;
      }> | null) ?? [];
    return {
      role: m.role as "user" | "assistant",
      content: m.content,
      files:
        rawFiles.length > 0
          ? rawFiles.map((f) => ({
              openai_file_id: f.openai_file_id,
              type: f.type,
              name: f.name || (f.type === "image" ? "imagen" : f.type === "video" ? "video" : f.type === "audio" ? "audio" : "archivo"),
              // El número viaja al cliente a propósito: es el rótulo que ya
              // escuchó el modelo. Sin él la interfaz vuelve a contar sola y
              // muestra "imagen 1" donde el modelo entiende "imagen 3".
              ...(typeof f.n === "number" ? { n: f.n } : {}),
            }))
          : undefined,
    };
  });
}
