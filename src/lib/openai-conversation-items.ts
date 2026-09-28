import type OpenAI from "openai";

// Borra items de una Conversation desde el final hacia atrás, hasta el último
// mensaje del usuario (inclusive por default). Mirar solo 1-2 ítems dejaba
// vivo el mensaje del usuario cuando había ítems intermedios (reasoning,
// herramientas), y al reenviarlo quedaba duplicado.
//
// Compartido por Regenerar/Editar (chat-turn.ts) y el reintento automático de
// salidas degeneradas (chat-stream.ts): ambos necesitan "olvidar" el último
// turno antes de generar de nuevo sin duplicar el mensaje del usuario.
export async function deleteLastTurn(
  openai: OpenAI,
  conversationId: string,
  { includeUser = true }: { includeUser?: boolean } = {}
): Promise<void> {
  const recent = await openai.conversations.items.list(conversationId, {
    order: "desc",
    limit: 100,
  });
  const userIndex = recent.data.findIndex(
    (item) => item.type === "message" && item.role === "user"
  );
  // Sin mensaje de usuario visible: solo se toca una respuesta final suelta.
  const stale =
    userIndex === -1
      ? recent.data.slice(0, 1).filter((item) => item.type === "message" && item.role === "assistant")
      : recent.data.slice(0, includeUser ? userIndex + 1 : userIndex);
  for (const item of stale) {
    if (!item.id) continue;
    await openai.conversations.items.delete(item.id, { conversation_id: conversationId });
  }
}
