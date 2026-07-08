// Lee el body SSE de una respuesta de /api/chat, /api/chat/regenerate o
// /api/admin/gpts/[id]/test-chat y llama onToken por cada fragmento de texto.
// Compartido entre UnifiedChat (chat real) y AdminGptTestModal (chat efímero).
export async function consumeSSE(res: Response, onToken: (text: string) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const data = line.replace("data: ", "");
      if (data === "[DONE]") continue;
      const parsed = JSON.parse(data);
      if (parsed.text) onToken(parsed.text);
    }
  }
}
