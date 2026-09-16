import { describe, expect, it } from "vitest";
import { MAX_FILES_PER_MESSAGE } from "./upload-file";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  parseChatTurnBody,
  parseRegenerateBody,
} from "./chat-turn-parse";

describe("parseChatTurnBody", () => {
  const valid = {
    gptId: "gpt-1",
    threadId: "th-1",
    message: "Hola",
  };

  it("acepta un turno de texto válido", () => {
    expect(parseChatTurnBody(valid)).toEqual({
      ok: true,
      gptId: "gpt-1",
      threadId: "th-1",
      message: "Hola",
      replaceLast: false,
      requestedIds: [],
    });
  });

  it("marca replaceLast solo si es true", () => {
    expect(parseChatTurnBody({ ...valid, replaceLast: true }).ok).toBe(true);
    if (parseChatTurnBody({ ...valid, replaceLast: true }).ok) {
      expect(parseChatTurnBody({ ...valid, replaceLast: true })).toMatchObject({
        replaceLast: true,
      });
    }
    expect(parseChatTurnBody({ ...valid, replaceLast: "true" })).toMatchObject({
      replaceLast: false,
    });
  });

  it("rechaza parámetros faltantes o no-objeto", () => {
    expect(parseChatTurnBody(null)).toEqual({
      ok: false,
      status: 400,
      error: "Faltan parámetros",
    });
    expect(parseChatTurnBody({ gptId: "gpt-1", threadId: "", message: "x" })).toMatchObject({
      error: "Faltan parámetros",
    });
    expect(parseChatTurnBody({ gptId: "gpt-1", threadId: "th-1", message: 1 })).toMatchObject({
      error: "Faltan parámetros",
    });
  });

  it("rechaza mensaje demasiado largo", () => {
    expect(
      parseChatTurnBody({ ...valid, message: "a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1) })
    ).toEqual({
      ok: false,
      status: 400,
      error: "El mensaje es demasiado largo",
    });
  });

  it("rechaza más archivos que el máximo", () => {
    const files = Array.from({ length: MAX_FILES_PER_MESSAGE + 1 }, (_, i) => ({
      openai_file_id: `file-${i}`,
    }));
    expect(parseChatTurnBody({ ...valid, files })).toEqual({
      ok: false,
      status: 400,
      error: `Puedes adjuntar hasta ${MAX_FILES_PER_MESSAGE} archivos por mensaje.`,
    });
  });

  it("rechaza adjuntos inválidos o duplicados", () => {
    expect(parseChatTurnBody({ ...valid, files: [{ no_id: true }] })).toEqual({
      ok: false,
      status: 400,
      error: "Adjuntos inválidos",
    });
    expect(
      parseChatTurnBody({
        ...valid,
        files: [{ openai_file_id: "a" }, { openai_file_id: "a" }],
      })
    ).toEqual({
      ok: false,
      status: 400,
      error: "Adjuntos inválidos",
    });
  });

  it("rechaza mensaje vacío sin adjuntos y acepta vacío con archivos", () => {
    expect(parseChatTurnBody({ ...valid, message: "   " })).toEqual({
      ok: false,
      status: 400,
      error: "El mensaje está vacío",
    });
    expect(
      parseChatTurnBody({
        ...valid,
        message: "  ",
        files: [{ openai_file_id: "file-1" }],
      })
    ).toMatchObject({ ok: true, requestedIds: ["file-1"] });
  });
});

describe("parseRegenerateBody", () => {
  it("acepta gptId y threadId", () => {
    expect(parseRegenerateBody({ gptId: "g", threadId: "t" })).toEqual({
      ok: true,
      gptId: "g",
      threadId: "t",
    });
  });

  it("rechaza faltantes", () => {
    expect(parseRegenerateBody({})).toEqual({
      ok: false,
      status: 400,
      error: "Faltan parámetros",
    });
  });
});
