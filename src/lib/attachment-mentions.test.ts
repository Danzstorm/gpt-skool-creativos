import { describe, expect, it } from "vitest";
import { assignThreadNumbers } from "./attachment-labels";
import {
  assignDocumentNumbers,
  completeTokenRange,
  filterMentionCandidates,
  findCandidateByToken,
  insertMentionToken,
  listMentionCandidates,
  MENTION_CHIP_STILL_PX,
  MENTION_HOVER_PREVIEW_PX,
  MENTION_STILL_MIN_PX,
  mentionChipLabel,
  mentionMenuColumns,
  mentionTokenLabel,
  parseMentionTokens,
  resolveMentionTokens,
  type MentionCandidate,
} from "./attachment-mentions";

const img = (id: string, n?: number, previewUrl?: string) => ({
  openai_file_id: id,
  type: "image" as const,
  name: `${id}.png`,
  ...(n ? { n } : {}),
  ...(previewUrl ? { previewUrl } : {}),
});
const vid = (id: string, n?: number) => ({
  openai_file_id: id,
  type: "video" as const,
  name: `${id}.mp4`,
  ...(n ? { n } : {}),
});
const doc = (id: string, name = `${id}.pdf`) => ({
  openai_file_id: id,
  type: "document" as const,
  name,
});
const msg = (files: unknown) => ({ files });

const candidate = (over: Partial<MentionCandidate> & Pick<MentionCandidate, "id" | "n" | "kind">): MentionCandidate => ({
  token: over.kind === "image" ? `@Imagen ${over.n}` : over.kind === "video" ? `@Video ${over.n}` : `@Archivo ${over.n}`,
  modelLabel:
    over.kind === "image" ? `imagen ${over.n}` : over.kind === "video" ? `descripción de video ${over.n}` : `archivo ${over.n}`,
  name: over.name ?? over.id,
  ...over,
});

describe("listMentionCandidates", () => {
  it("lista las imágenes del hilo y las pendientes con su número", () => {
    const history = [msg([img("a", 1), img("b", 2)])];
    const outgoing = [img("c")];
    const numbers = assignThreadNumbers(history, outgoing);
    const list = listMentionCandidates(history, outgoing, numbers);

    expect(list.map((item) => item.token)).toEqual(["@Imagen 1", "@Imagen 2", "@Imagen 3"]);
    expect(list.map((item) => item.modelLabel)).toEqual(["imagen 1", "imagen 2", "imagen 3"]);
  });

  it("incluye videos y documentos numerados", () => {
    const history = [msg([img("i", 1), vid("v", 1), doc("d", "brief.pdf")])];
    const list = listMentionCandidates(history, [], assignThreadNumbers(history));

    expect(list.find((item) => item.id === "v")).toMatchObject({ token: "@Video 1", kind: "video" });
    expect(list.find((item) => item.id === "d")).toMatchObject({
      token: "@Archivo 1",
      modelLabel: "archivo 1",
      name: "brief.pdf",
    });
  });

  it("un archivo re-adjuntado no se duplica y conserva el número", () => {
    const history = [msg([img("a", 1)])];
    const outgoing = [img("a", 1, "blob:a")];
    const list = listMentionCandidates(history, outgoing, assignThreadNumbers(history, outgoing));

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "a", token: "@Imagen 1", previewUrl: "blob:a" });
  });

  it("un hilo vacío con fotos en la bandeja igual se puede mencionar", () => {
    const outgoing = [img("nueva")];
    const numbers = assignThreadNumbers([], outgoing);
    const list = listMentionCandidates([], outgoing, numbers);

    expect(list).toEqual([
      expect.objectContaining({ token: "@Imagen 1", id: "nueva" }),
    ]);
  });

  it("el video de la bandeja lleva poster y duración al menú", () => {
    const outgoing = [{ ...vid("clip", 1), previewUrl: "blob:poster", durationSeconds: 95 }];
    const list = listMentionCandidates([], outgoing, assignThreadNumbers([], outgoing));
    expect(list[0]).toMatchObject({
      id: "clip",
      token: "@Video 1",
      previewUrl: "blob:poster",
      durationSeconds: 95,
    });
  });
});

describe("assignDocumentNumbers", () => {
  it("numera por primera aparición a lo largo del hilo", () => {
    const docs = assignDocumentNumbers(
      [msg([doc("a"), img("i", 1)]), msg([doc("b")])],
      [doc("a"), doc("c")]
    );

    expect([...docs]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });
});

describe("filterMentionCandidates", () => {
  const items = [
    candidate({ id: "a", kind: "image", n: 1 }),
    candidate({ id: "b", kind: "image", n: 2 }),
    candidate({ id: "v", kind: "video", n: 1 }),
    candidate({ id: "d", kind: "document", n: 1, name: "brief.pdf" }),
  ];

  it("con @ o consulta vacía lista todo", () => {
    expect(filterMentionCandidates(items, "")).toHaveLength(4);
    expect(filterMentionCandidates(items, "@")).toHaveLength(4);
  });

  it("im filtra las imágenes y no el video", () => {
    expect(filterMentionCandidates(items, "im").map((item) => item.token)).toEqual([
      "@Imagen 1",
      "@Imagen 2",
    ]);
  });

  it("encuentra por número y por nombre de archivo", () => {
    expect(filterMentionCandidates(items, "2").map((item) => item.id)).toEqual(["b"]);
    expect(filterMentionCandidates(items, "brief").map((item) => item.id)).toEqual(["d"]);
  });

  it("ignora mayúsculas y acentos", () => {
    expect(filterMentionCandidates(items, "IMAGEN")).toHaveLength(2);
    expect(filterMentionCandidates(items, "vídeo").map((item) => item.id)).toEqual(["v"]);
  });
});

describe("parseo de @ en el texto", () => {
  it("separa chips de texto suelto", () => {
    expect(parseMentionTokens("usa @Imagen 2 de referencia")).toEqual([
      { type: "text", value: "usa " },
      { type: "token", value: "@Imagen 2" },
      { type: "text", value: " de referencia" },
    ]);
  });

  it("reconoce video y archivo", () => {
    const parts = parseMentionTokens("mira @Video 1 y @Archivo 3");
    expect(parts.filter((p) => p.type === "token").map((p) => p.value)).toEqual([
      "@Video 1",
      "@Archivo 3",
    ]);
  });

  it("un cursor dentro del chip no es una mención en curso", () => {
    const text = "usa @Imagen 2 ahora";
    const start = text.indexOf("@");
    expect(completeTokenRange(text, start + 4)).toEqual({
      start,
      end: start + "@Imagen 2".length,
      token: "@Imagen 2",
    });
    expect(completeTokenRange(text, start)).toBeNull();
    expect(completeTokenRange(text, start + "@Imagen 2".length)).toBeNull();
  });
});

describe("insertMentionToken", () => {
  it("reemplaza @im por el token y deja un espacio", () => {
    expect(insertMentionToken("usa @im", 4, 7, "@Imagen 2")).toEqual({
      text: "usa @Imagen 2 ",
      caret: 14,
    });
  });

  it("no duplica el espacio si ya había uno detrás", () => {
    expect(insertMentionToken("usa @im de", 4, 7, "@Imagen 2")).toEqual({
      text: "usa @Imagen 2 de",
      caret: 13,
    });
  });
});

describe("resolveMentionTokens", () => {
  it("el modelo recibe los rótulos que ya entiende", () => {
    expect(resolveMentionTokens("usa @Imagen 2 y @Video 1 más @Archivo 3")).toBe(
      "usa imagen 2 y descripción de video 1 más archivo 3"
    );
  });

  it("no toca texto sin menciones", () => {
    expect(resolveMentionTokens("hola imagen 2")).toBe("hola imagen 2");
  });
});

describe("rótulos y layout del picker", () => {
  it("en la línea el token conserva el @", () => {
    expect(mentionTokenLabel("@Imagen 1")).toBe("@Imagen 1");
    expect(mentionTokenLabel("@Video 2")).toBe("@Video 2");
    expect(mentionTokenLabel("Imagen 3")).toBe("@Imagen 3");
  });

  it("el picker rota Imagen N, sin duplicar el @", () => {
    expect(mentionChipLabel("@Imagen 1")).toBe("Imagen 1");
    expect(mentionChipLabel("@Video 2")).toBe("Video 2");
    expect(mentionChipLabel("Imagen 3")).toBe("Imagen 3");
  });

  it("una foto es columna ancha; varias van en 2 columnas", () => {
    expect(mentionMenuColumns(0)).toBe(1);
    expect(mentionMenuColumns(1)).toBe(1);
    expect(mentionMenuColumns(2)).toBe(2);
    expect(mentionMenuColumns(5)).toBe(2);
  });

  it("los stills del picker y el hover no pueden volver a 16px", () => {
    expect(MENTION_STILL_MIN_PX).toBeGreaterThanOrEqual(120);
    expect(MENTION_HOVER_PREVIEW_PX).toBeGreaterThanOrEqual(240);
    expect(MENTION_HOVER_PREVIEW_PX).toBeLessThanOrEqual(320);
    expect(MENTION_CHIP_STILL_PX).toBeGreaterThanOrEqual(20);
  });
});

describe("findCandidateByToken", () => {
  it("prefiere el que tiene foto para el popover", () => {
    const items = [
      candidate({ id: "a", kind: "image", n: 1 }),
      candidate({ id: "b", kind: "image", n: 1, previewUrl: "blob:b" }),
    ];
    expect(findCandidateByToken(items, "@Imagen 1")?.id).toBe("b");
  });
});
