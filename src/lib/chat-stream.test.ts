import { describe, expect, it, vi } from "vitest";

const { create, itemsList, itemsDelete } = vi.hoisted(() => ({
  create: vi.fn(),
  itemsList: vi.fn().mockResolvedValue({ data: [] }),
  itemsDelete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("openai", () => ({
  default: class {
    responses = { create };
    conversations = { items: { list: itemsList, delete: itemsDelete } };
  },
}));

import { runStreamResponse } from "./chat-stream";

/** Junta todos los frames `data: {...}` de un stream de runStreamResponse. */
async function collectFrames(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((f) => f.replace(/^data: /, "").trim())
    .filter((f) => f && f !== "[DONE]")
    .map((f) => JSON.parse(f));
}

describe("runStreamResponse — cliente desconectado", () => {
  it("guarda lo generado aunque el cliente haya cancelado el stream", async () => {
    let releaseFailure!: () => void;
    const clientGone = new Promise<void>((resolve) => (releaseFailure = resolve));
    create.mockResolvedValue(
      (async function* () {
        yield { type: "response.output_text.delta", delta: "Hola" };
        await clientGone;
        throw new Error("Request was aborted.");
      })()
    );

    const saved: string[] = [];
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => (settle = resolve));
    const res = runStreamResponse({
      conversationId: "conv",
      model: "gpt-4.1-mini",
      instructions: "",
      input: [],
      onAssistantText: (text) => {
        saved.push(text);
      },
      onSettled: async () => settle(),
    });

    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    releaseFailure();
    await settled;

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^Hola/);
    expect(saved[0]).toContain("⚠️");
  });
});

describe("runStreamResponse — salida degenerada", () => {
  it("reintenta una vez si la respuesta es corta e ilegible, y guarda el reintento bueno", async () => {
    create.mockReset();
    itemsList.mockClear();
    itemsDelete.mockClear();
    const completedEvent = (outputTokens: number) => ({
      type: "response.completed" as const,
      response: { model: "gpt-4.1-mini", usage: { input_tokens: 10, output_tokens: outputTokens } },
    });
    create
      .mockResolvedValueOnce(
        (async function* () {
          // Caso real de prod: unos pocos tokens de un alfabeto sin letras latinas.
          yield { type: "response.output_text.delta", delta: "ऱ२०" };
          yield completedEvent(4);
        })()
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield { type: "response.output_text.delta", delta: "Todo listo." };
          yield completedEvent(12);
        })()
      );
    itemsList.mockResolvedValueOnce({
      data: [
        { id: "item_assistant", type: "message", role: "assistant" },
        { id: "item_user", type: "message", role: "user" },
      ],
    });

    const saved: string[] = [];
    const res = runStreamResponse({
      conversationId: "conv",
      model: "gpt-4.1-mini",
      instructions: "",
      input: [{ role: "user", content: "hola" } as never],
      onAssistantText: (text) => {
        saved.push(text);
      },
    });

    const frames = await collectFrames(res);

    expect(create).toHaveBeenCalledTimes(2);
    // Se borra el turno basura completo (usuario + respuesta) antes de reintentar,
    // igual que Regenerar: si no, el reintento duplicaría la pregunta en OpenAI.
    expect(itemsDelete).toHaveBeenCalledWith("item_assistant", { conversation_id: "conv" });
    expect(itemsDelete).toHaveBeenCalledWith("item_user", { conversation_id: "conv" });
    expect(frames.some((f) => f.reset === true)).toBe(true);
    expect(saved).toEqual(["Todo listo."]);
  });

  it("no reintenta una respuesta corta pero legible", async () => {
    create.mockReset();
    create.mockResolvedValueOnce(
      (async function* () {
        yield { type: "response.output_text.delta", delta: "Sí." };
        yield {
          type: "response.completed",
          response: { model: "gpt-4.1-mini", usage: { input_tokens: 5, output_tokens: 3 } },
        };
      })()
    );

    const saved: string[] = [];
    await collectFrames(
      runStreamResponse({
        conversationId: "conv",
        model: "gpt-4.1-mini",
        instructions: "",
        input: [],
        onAssistantText: (text) => {
          saved.push(text);
        },
      })
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["Sí."]);
  });
});
