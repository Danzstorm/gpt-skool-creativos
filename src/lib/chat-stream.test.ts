import { describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

import { runStreamResponse } from "./chat-stream";

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
