import OpenAI from "openai";
import type { Message } from "@/lib/types";

export async function getThreadMessages(openaiThreadId: string): Promise<Message[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { data: oaiMessages } = await openai.beta.threads.messages.list(openaiThreadId, {
    order: "asc",
    limit: 100,
  });

  return oaiMessages
    .map((msg) => {
      const text = msg.content
        .filter((c) => c.type === "text")
        .map((c) => (c.type === "text" ? c.text.value : ""))
        .join("\n");
      return { role: msg.role as "user" | "assistant", content: text };
    })
    .filter((m) => m.content.trim().length > 0);
}
