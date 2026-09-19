import { describe, expect, it } from "vitest";
import { buildUserInput, type IncomingFile } from "./chat-content";
import { assignThreadNumbers } from "./attachment-labels";

// Los números salen del hilo, no del mensaje. En estos casos el hilo es solo el
// turno que se está armando, que es el escenario de un chat sin historia.
const build = (message: string, files: IncomingFile[], history: { files?: unknown }[] = []) =>
  buildUserInput(message, files, assignThreadNumbers(history, files));

const image = (id: string): IncomingFile => ({ openai_file_id: id, type: "image" });
const document = (id: string, name?: string): IncomingFile => ({
  openai_file_id: id,
  type: "document",
  name,
});
const video = (id: string, videoDescription?: string): IncomingFile => ({
  openai_file_id: id,
  type: "video",
  videoDescription,
});

/** Las partes del único item de usuario que devuelve buildUserInput. */
function partsOf(input: ReturnType<typeof buildUserInput>) {
  // ResponseInputItem es una unión que incluye ItemReference (sin `content`),
  // así que el cast directo no compila. Se pasa por unknown a propósito: acá
  // sabemos que buildUserInput siempre devuelve un item de rol usuario.
  const item = input[0] as unknown as { role: string; content: Array<Record<string, unknown>> };
  return item.content;
}

describe("buildUserInput — etiquetas de imagen", () => {
  it("pone la etiqueta INMEDIATAMENTE antes de cada imagen", () => {
    // La adyacencia es lo que hace que funcione: el modelo asocia el rótulo
    // con la imagen que viene justo después. Si las etiquetas fueran todas
    // juntas al principio, tendría que adivinar el orden.
    const parts = partsOf(build("compará", [image("file-A"), image("file-B")]));

    expect(parts).toEqual([
      { type: "input_text", text: "compará" },
      { type: "input_text", text: "Imagen 1:" },
      { type: "input_image", file_id: "file-A", detail: "auto" },
      { type: "input_text", text: "Imagen 2:" },
      { type: "input_image", file_id: "file-B", detail: "auto" },
    ]);
  });

  it("numera solo imágenes aunque haya documentos intercalados", () => {
    const parts = partsOf(
      build("", [document("file-D1"), image("file-A"), document("file-D2"), image("file-B")])
    );
    const etiquetas = parts.filter((p) => p.type === "input_text").map((p) => p.text);

    expect(etiquetas).toEqual(["Imagen 1:", "Imagen 2:"]);
  });
});

describe("buildUserInput — documentos", () => {
  it("manda el nombre real del documento", () => {
    // Acá el nombre SÍ es información: alguien escribe "analizá el brief.pdf".
    const parts = partsOf(build("", [document("file-D", "brief-2026.pdf")]));

    expect(parts).toEqual([
      { type: "input_file", file_id: "file-D", filename: "brief-2026.pdf" },
    ]);
  });

  it("omite filename cuando no hay nombre, en vez de mandarlo vacío", () => {
    const parts = partsOf(build("", [document("file-D")]));
    expect(parts[0]).not.toHaveProperty("filename");
  });
});

describe("buildUserInput — videos", () => {
  it("manda la descripción de Gemini como texto directo, nunca como archivo", () => {
    // El video en sí NUNCA se sube a OpenAI (Responses API no lo entiende) —
    // lo único que ve el modelo es el texto que describió Gemini.
    const parts = partsOf(build("", [video("video-1", "Un gato cruza una habitación soleada.")]));

    expect(parts).toEqual([
      { type: "input_text", text: "Descripción de video 1:" },
      { type: "input_text", text: "Un gato cruza una habitación soleada." },
    ]);
  });

  it("numera solo videos aunque haya imágenes y documentos intercalados", () => {
    const parts = partsOf(
      build("", [image("file-A"), video("video-1", "desc 1"), document("file-D"), video("video-2", "desc 2")])
    );
    const etiquetas = parts.filter((p) => p.type === "input_text").map((p) => p.text);

    expect(etiquetas).toEqual(["Imagen 1:", "Descripción de video 1:", "desc 1", "Descripción de video 2:", "desc 2"]);
  });

  it("no manda una parte vacía cuando Gemini no dejó descripción", () => {
    const parts = partsOf(build("", [video("video-1", undefined)]));
    expect(parts[1]).toEqual({ type: "input_text", text: "(sin descripción disponible)" });
  });
});

describe("buildUserInput — sin adjuntos no cambia nada", () => {
  it("un mensaje de solo texto produce exactamente una parte", () => {
    // Esta es la garantía de no regresión: los turnos sin adjuntos tienen que
    // seguir viéndose igual que antes del cambio, sin etiquetas sueltas.
    expect(partsOf(build("hola", []))).toEqual([{ type: "input_text", text: "hola" }]);
  });

  it("no agrega una parte de texto vacía cuando el mensaje viene en blanco", () => {
    // Se puede mandar solo una imagen, sin escribir nada.
    const parts = partsOf(build("   ", [image("file-A")]));
    expect(parts).toEqual([
      { type: "input_text", text: "Imagen 1:" },
      { type: "input_image", file_id: "file-A", detail: "auto" },
    ]);
  });

  it("recorta el texto del usuario", () => {
    const parts = partsOf(build("  hola  ", []));
    expect(parts).toEqual([{ type: "input_text", text: "hola" }]);
  });

  it("resuelve los chips @ del composer al rótulo que entiende el modelo", () => {
    const parts = partsOf(build("usa @Imagen 2 de referencia", [image("file-A"), image("file-B")]));
    expect(parts[0]).toEqual({ type: "input_text", text: "usa imagen 2 de referencia" });
  });
});
