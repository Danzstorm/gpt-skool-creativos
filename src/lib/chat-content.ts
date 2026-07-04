import type { ResponseInputItem } from "openai/resources/responses/responses";

export type IncomingFile = { openai_file_id: string; type: "image" | "document" };

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; file_id: string; detail: "auto" }
  | { type: "input_file"; file_id: string };

/** Construye el `input` de una Response a partir de texto + archivos adjuntos. */
export function buildUserInput(message: string, files: IncomingFile[]): ResponseInputItem[] {
  const contentParts: ContentPart[] = [{ type: "input_text", text: message }];
  for (const f of files) {
    if (f.type === "image") {
      contentParts.push({ type: "input_image", file_id: f.openai_file_id, detail: "auto" });
    } else if (f.type === "document") {
      contentParts.push({ type: "input_file", file_id: f.openai_file_id });
    }
  }
  return [{ role: "user", content: contentParts }];
}
