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
      const imageFiles = msg.content
        .filter((c) => c.type === "image_file")
        .map((c) => (c.type === "image_file" ? c.image_file.file_id : ""))
        .filter(Boolean)
        .map((fid) => ({ name: "imagen", openai_file_id: fid, type: "image" as const }));
      return {
        role: msg.role as "user" | "assistant",
        content: text,
        files: imageFiles.length > 0 ? imageFiles : undefined,
      };
    })
    .filter((m) => m.content.trim().length > 0 || (m.files && m.files.length > 0));
}
