import type { ResponseInputItem } from "openai/resources/responses/responses";
import { imageLabel, imageNumber, videoLabel, videoNumber } from "@/lib/attachment-labels";

export type IncomingFile = {
  openai_file_id: string;
  type: "image" | "document" | "video";
  /** Nombre real del documento. Las imágenes no lo usan (ver abajo). */
  name?: string | null;
  /**
   * Solo para videos: la descripción que generó Gemini al procesar el video
   * (uploaded_files.video_description). El video NUNCA se sube a OpenAI —
   * Responses API no lo entiende — así que esto es lo único que el modelo ve.
   */
  videoDescription?: string | null;
};

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; file_id: string; detail: "auto" }
  | { type: "input_file"; file_id: string; filename?: string };

/**
 * Pone en mayúscula la etiqueta para que encabece su bloque como un rótulo
 * ("Imagen 1:") sin duplicar el string, que vive en attachment-labels.
 */
function heading(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Construye el `input` de una Response a partir de texto + archivos adjuntos.
 *
 * Cada imagen va precedida por su etiqueta ("Imagen 1:"). Antes se mandaba solo
 * `input_image` con el `file_id` y nada más, así que el modelo no tenía ningún
 * nombre para referirse a ellas y terminaba citando el nombre del archivo o la
 * ruta del sandbox — de ahí las respuestas con "mt.data.image23490.png". Con la
 * etiqueta pegada al contenido, el modelo usa el mismo vocabulario que ve el
 * usuario en el composer.
 *
 * Los documentos llevan `filename`: ahí el nombre SÍ es información (alguien
 * dice "analizá el brief.pdf") y el tipo `ResponseInputFile` lo admite.
 */
export function buildUserInput(message: string, files: IncomingFile[]): ResponseInputItem[] {
  const contentParts: ContentPart[] = [];
  if (message.trim()) contentParts.push({ type: "input_text", text: message.trim() });

  files.forEach((f, index) => {
    if (f.type === "image") {
      const position = imageNumber(files, index);
      if (position !== null) {
        contentParts.push({ type: "input_text", text: `${heading(imageLabel(position))}:` });
      }
      contentParts.push({ type: "input_image", file_id: f.openai_file_id, detail: "auto" });
    } else if (f.type === "document") {
      contentParts.push({
        type: "input_file",
        file_id: f.openai_file_id,
        ...(f.name ? { filename: f.name } : {}),
      });
    } else if (f.type === "video") {
      const position = videoNumber(files, index);
      const label = position !== null ? videoLabel(position) : "descripción de video";
      contentParts.push({ type: "input_text", text: `${heading(label)}:` });
      contentParts.push({ type: "input_text", text: f.videoDescription?.trim() || "(sin descripción disponible)" });
    }
  });

  return [{ role: "user", content: contentParts }];
}
