import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

// El contexto que el modelo usa NO se reenvía desde Postgres: vive en la
// Conversation de OpenAI referenciada por threads.openai_conversation_id. Y esa
// Conversation pertenece a la cuenta dueña de la API key. Al cambiar de key (por
// ejemplo, al pasar la plataforma a la cuenta del cliente), los IDs creados con
// la anterior devuelven 404 y ninguna conversación existente puede continuarse.
//
// Aquí se recupera ese caso sin migración masiva ni intervención manual: la
// primera vez que se usa un thread cuya huella de key no coincide con la actual
// se comprueba su Conversation y, si ya no existe, se crea una nueva sembrada
// con el historial que sí conservamos (la tabla `messages`).

// Identifica la key en uso sin poder reconstruirla. Se calcula una vez por
// proceso: el caso normal (huella que coincide) no cuesta ni una llamada a la API.
export const CONVERSATION_KEY_FINGERPRINT = createHash("sha256")
  .update(process.env.OPENAI_API_KEY ?? "")
  .digest("hex")
  .slice(0, 16);

// Cuántos mensajes recientes se siembran. Suficiente para que el modelo retome
// el hilo sin arrastrar (ni pagar) conversaciones enteras de cientos de turnos.
const SEEDED_MESSAGES = 40;

// La Conversations API acepta como mucho 20 items por llamada.
const ITEMS_PER_CALL = 20;

type StoredFile = { name?: unknown; type?: unknown };

/** 404 de la API: el recurso vive en otra cuenta, o ya no existe. */
export function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

/**
 * Texto con el que un mensaje viejo entra en la Conversation nueva.
 *
 * Los adjuntos no se re-suben: sus `file_id` pertenecen al proyecto de OpenAI
 * anterior y también darían 404. Se dejan nombrados para que el modelo sepa que
 * existieron — las miniaturas las sigue sirviendo Storage, así que el usuario ve
 * su historial completo aunque el modelo solo lea esta referencia.
 */
function seedText(content: string, files: unknown): string {
  const labels = (Array.isArray(files) ? (files as StoredFile[]) : []).map((file) => {
    if (typeof file?.name === "string" && file.name) return file.name;
    return file?.type === "image" ? "imagen" : "archivo";
  });
  const marker = labels.length > 0 ? `\n\n[Adjuntos del mensaje original: ${labels.join(", ")}]` : "";
  return `${content ?? ""}${marker}`.trim();
}

async function buildSeedItems(
  supabase: SupabaseClient,
  threadId: string
): Promise<ResponseInputItem[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, files")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(SEEDED_MESSAGES);
  if (error || !data) return [];

  return data
    .reverse()
    .map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: seedText(message.content, message.files),
    }))
    // Un item sin texto es un 400; y sin contenido tampoco aporta contexto.
    .filter((item) => item.content.length > 0);
}

/** True si el thread se creó con otra API key (o nunca se ha comprobado). */
export function needsConversationCheck(fingerprint: string | null): boolean {
  return fingerprint !== CONVERSATION_KEY_FINGERPRINT;
}

export interface EnsureConversationParams {
  openai: OpenAI;
  // Cliente con permiso para escribir en `threads` (service role o el del dueño).
  supabase: SupabaseClient;
  threadId: string;
  conversationId: string;
  /** threads.conversation_key_fingerprint tal como está guardado. */
  fingerprint: string | null;
  metadata: { user_id: string; gpt_id: string };
}

/**
 * Devuelve un conversationId utilizable con la API key en uso, recreando la
 * Conversation a partir del historial local si la guardada quedó en otra cuenta.
 */
export async function ensureThreadConversation({
  openai,
  supabase,
  threadId,
  conversationId,
  fingerprint,
  metadata,
}: EnsureConversationParams): Promise<string> {
  if (!needsConversationCheck(fingerprint)) return conversationId;

  // La huella distinta no basta para recrear: rotar la key DENTRO de la misma
  // cuenta cambia la huella pero conserva las Conversations. Manda la API.
  try {
    await openai.conversations.retrieve(conversationId);
    await supabase
      .from("threads")
      .update({ conversation_key_fingerprint: CONVERSATION_KEY_FINGERPRINT })
      .eq("id", threadId);
    return conversationId;
  } catch (error) {
    // Solo el 404 significa "está en otra cuenta". Ante un fallo de red o un 5xx
    // se propaga: recrear la Conversation por un error transitorio dejaría al
    // thread sin su contexto real.
    if (!isNotFound(error)) throw error;
  }

  const items = await buildSeedItems(supabase, threadId);
  const conversation = await openai.conversations.create({ metadata });
  try {
    for (let i = 0; i < items.length; i += ITEMS_PER_CALL) {
      await openai.conversations.items.create(conversation.id, {
        items: items.slice(i, i + ITEMS_PER_CALL),
      });
    }
    const { error } = await supabase
      .from("threads")
      .update({
        openai_conversation_id: conversation.id,
        conversation_key_fingerprint: CONVERSATION_KEY_FINGERPRINT,
        // La Conversation nueva se siembra desde `messages`, y el turno con el
        // contexto de la carpeta NUNCA se guarda ahí (es contexto invisible para
        // la UI, no un mensaje del usuario). O sea: la siembra no lo trae. Si la
        // huella sobreviviera a la recreación, el thread quedaría marcado como
        // "contexto ya aplicado" sobre una Conversation que no lo tiene, y el
        // proyecto dejaría de existir para ese chat sin un solo error. Se limpia
        // acá y no en cada ruta porque tanto /api/chat como /api/chat/regenerate
        // recrean por este mismo camino.
        project_context_fingerprint: null,
      })
      .eq("id", threadId);
    if (error) throw error;
  } catch (error) {
    // Si no se pudo sembrar o guardar, no dejar la Conversation huérfana: el
    // thread sigue apuntando a la vieja y el siguiente intento repite el proceso.
    await openai.conversations.delete(conversation.id).catch(() => {});
    throw error;
  }

  console.info("conversation rehydrated", {
    threadId,
    previousConversationId: conversationId,
    conversationId: conversation.id,
    seededMessages: items.length,
  });
  return conversation.id;
}

/**
 * Descarta los adjuntos cuyo `file_id` ya no existe en el proyecto de OpenAI
 * actual (típicamente, subidos con la API key anterior). Sin esto, regenerar un
 * mensaje heredado falla entero con "No such File object".
 */
export async function keepAvailableFiles<T extends { openai_file_id: string }>(
  openai: OpenAI,
  files: T[],
  options?: { trustIds?: ReadonlySet<string> }
): Promise<T[]> {
  if (files.length === 0) return files;
  const trusted = options?.trustIds ?? new Set<string>();
  const checks = await Promise.all(
    files.map(async (file) => {
      if (trusted.has(file.openai_file_id)) return true;
      try {
        await openai.files.retrieve(file.openai_file_id);
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    })
  );
  return files.filter((_, index) => checks[index]);
}
