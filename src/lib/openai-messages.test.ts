import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getThreadMessages } from "./openai-messages";
import { assignThreadNumbers } from "./attachment-labels";

/** Supabase de mentira: solo lo que encadena getThreadMessages. */
function fakeDb(rows: unknown[]): SupabaseClient {
  const result = { data: rows, error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("getThreadMessages", () => {
  it("conserva el número del adjunto al mapear", () => {
    // LA REGRESIÓN QUE FIJA: el map reconstruía cada archivo con solo tres
    // campos y se comía `n`. El número quedaba guardado en la base pero nunca
    // llegaba a la interfaz, que volvía a contar sola y mostraba "imagen 1"
    // donde el modelo entiende "imagen 3". Silencioso: nada falla, solo miente.
    const rows = [
      {
        role: "user",
        content: "mirá esto",
        files: [{ openai_file_id: "f1", type: "image", n: 3 }],
      },
    ];

    return getThreadMessages(fakeDb(rows), "t1").then((messages) => {
      expect(messages[0].files?.[0].n).toBe(3);
    });
  });

  it("el número que llega alcanza para que el cliente rotule igual que el modelo", () => {
    const rows = [
      { role: "user", content: "", files: [{ openai_file_id: "a", type: "image", n: 1 }] },
      { role: "assistant", content: "ok", files: null },
      { role: "user", content: "", files: [{ openai_file_id: "b", type: "image", n: 2 }] },
    ];

    return getThreadMessages(fakeDb(rows), "t1").then((messages) => {
      const { images } = assignThreadNumbers(messages);
      expect(images.get("a")).toBe(1);
      expect(images.get("b")).toBe(2);
    });
  });

  it("un archivo sin número no inventa uno", () => {
    // Lo anterior a que se empezara a guardar: el campo simplemente no está, y
    // assignThreadNumbers lo resuelve con la cuenta por mensaje.
    const rows = [
      { role: "user", content: "", files: [{ openai_file_id: "viejo", type: "image" }] },
    ];

    return getThreadMessages(fakeDb(rows), "t1").then((messages) => {
      expect(messages[0].files?.[0].n).toBeUndefined();
    });
  });

  it("los documentos conservan su nombre real", () => {
    const rows = [
      { role: "user", content: "", files: [{ openai_file_id: "d", type: "document", name: "brief.pdf" }] },
    ];

    return getThreadMessages(fakeDb(rows), "t1").then((messages) => {
      expect(messages[0].files?.[0].name).toBe("brief.pdf");
    });
  });

  it("un mensaje sin adjuntos no trae la lista", () => {
    const rows = [{ role: "assistant", content: "hola", files: null }];

    return getThreadMessages(fakeDb(rows), "t1").then((messages) => {
      expect(messages[0].files).toBeUndefined();
    });
  });
});
