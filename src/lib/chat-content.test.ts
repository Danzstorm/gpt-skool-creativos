import { describe, expect, it } from "vitest";
import { buildUserInput, type IncomingFile } from "./chat-content";

const image = (id: string): IncomingFile => ({ openai_file_id: id, type: "image" });
const document = (id: string, name?: string): IncomingFile => ({
  openai_file_id: id,
  type: "document",
  name,
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
    const parts = partsOf(buildUserInput("compará", [image("file-A"), image("file-B")]));

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
      buildUserInput("", [document("file-D1"), image("file-A"), document("file-D2"), image("file-B")])
    );
    const etiquetas = parts.filter((p) => p.type === "input_text").map((p) => p.text);

    expect(etiquetas).toEqual(["Imagen 1:", "Imagen 2:"]);
  });
});

describe("buildUserInput — documentos", () => {
  it("manda el nombre real del documento", () => {
    // Acá el nombre SÍ es información: alguien escribe "analizá el brief.pdf".
    const parts = partsOf(buildUserInput("", [document("file-D", "brief-2026.pdf")]));

    expect(parts).toEqual([
      { type: "input_file", file_id: "file-D", filename: "brief-2026.pdf" },
    ]);
  });

  it("omite filename cuando no hay nombre, en vez de mandarlo vacío", () => {
    const parts = partsOf(buildUserInput("", [document("file-D")]));
    expect(parts[0]).not.toHaveProperty("filename");
  });
});

describe("buildUserInput — sin adjuntos no cambia nada", () => {
  it("un mensaje de solo texto produce exactamente una parte", () => {
    // Esta es la garantía de no regresión: los turnos sin adjuntos tienen que
    // seguir viéndose igual que antes del cambio, sin etiquetas sueltas.
    expect(partsOf(buildUserInput("hola", []))).toEqual([{ type: "input_text", text: "hola" }]);
  });

  it("no agrega una parte de texto vacía cuando el mensaje viene en blanco", () => {
    // Se puede mandar solo una imagen, sin escribir nada.
    const parts = partsOf(buildUserInput("   ", [image("file-A")]));
    expect(parts).toEqual([
      { type: "input_text", text: "Imagen 1:" },
      { type: "input_image", file_id: "file-A", detail: "auto" },
    ]);
  });

  it("recorta el texto del usuario", () => {
    const parts = partsOf(buildUserInput("  hola  ", []));
    expect(parts).toEqual([{ type: "input_text", text: "hola" }]);
  });
});
