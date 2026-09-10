import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { ensureThreadConversation } from "./conversation-sync";

type ThreadUpdate = Record<string, unknown>;

/**
 * Cliente de Supabase mínimo: encadena como el real y devuelve los mensajes
 * sembrados o un ok, según la tabla. Solo existe para capturar con qué se
 * actualiza `threads`.
 */
function fakeSupabase(messages: Array<{ role: string; content: string; files: null }>) {
  const updates: ThreadUpdate[] = [];
  let table: string | null = null;

  const builder = {
    from(name: string) {
      table = name;
      return builder;
    },
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    update(payload: ThreadUpdate) {
      updates.push(payload);
      return builder;
    },
    then(resolve: (value: unknown) => void) {
      resolve(table === "messages" ? { data: messages, error: null } : { error: null });
    },
  };

  return { client: builder as unknown as SupabaseClient, updates };
}

function fakeOpenAI(options: { retrieveFails: boolean }) {
  return {
    conversations: {
      retrieve: async () => {
        if (options.retrieveFails) throw Object.assign(new Error("not found"), { status: 404 });
        return { id: "conv_vieja" };
      },
      create: async () => ({ id: "conv_nueva" }),
      items: { create: async () => ({}) },
      delete: async () => ({}),
    },
  } as unknown as OpenAI;
}

const params = {
  threadId: "thread-1",
  conversationId: "conv_vieja",
  // Distinta de la huella de la key en uso: obliga a comprobar contra la API.
  fingerprint: "huella-de-otra-key",
  metadata: { user_id: "user-1", gpt_id: "gpt-1" },
};

describe("ensureThreadConversation", () => {
  it("olvida el contexto de proyecto aplicado cuando recrea la Conversation", async () => {
    // La regresión que esto cubre: la Conversation nueva se siembra desde
    // `messages`, y el turno con el texto de la carpeta nunca se guarda ahí. Si
    // la huella sobreviviera, el thread quedaría marcado como "contexto ya
    // aplicado" sobre una Conversation que no lo tiene y el proyecto dejaría de
    // existir para ese chat, sin ningún error a la vista.
    const { client, updates } = fakeSupabase([
      { role: "user", content: "hola", files: null },
      { role: "assistant", content: "buenas", files: null },
    ]);

    const result = await ensureThreadConversation({
      openai: fakeOpenAI({ retrieveFails: true }),
      supabase: client,
      ...params,
    });

    expect(result).toBe("conv_nueva");
    const threadUpdate = updates.at(-1)!;
    expect(threadUpdate.openai_conversation_id).toBe("conv_nueva");
    expect(threadUpdate.project_context_fingerprint).toBeNull();
  });

  it("NO toca el contexto aplicado cuando la Conversation sigue viva", async () => {
    // Rotar la key dentro de la misma cuenta cambia la huella pero conserva las
    // Conversations. Limpiar acá reinyectaría el texto de la carpeta y lo
    // dejaría duplicado en el historial, cobrado dos veces.
    const { client, updates } = fakeSupabase([]);

    const result = await ensureThreadConversation({
      openai: fakeOpenAI({ retrieveFails: false }),
      supabase: client,
      ...params,
    });

    expect(result).toBe("conv_vieja");
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty("project_context_fingerprint");
  });
});
