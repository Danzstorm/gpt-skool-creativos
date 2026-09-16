import { describe, expect, it } from "vitest";
import {
  clientAttachmentLabel,
  friendlyStreamError,
  interpretChatStreamResponse,
} from "./stream-errors";

describe("friendlyStreamError", () => {
  it("traduce fallos de red crudos del navegador", () => {
    expect(friendlyStreamError(new Error("Failed to fetch"))).toBe(
      "Se perdió la conexión. Intenta de nuevo."
    );
    expect(friendlyStreamError(new Error("NetworkError when attempting to fetch resource."))).toBe(
      "Se perdió la conexión. Intenta de nuevo."
    );
    expect(friendlyStreamError(new Error("Load failed"))).toBe(
      "Se perdió la conexión. Intenta de nuevo."
    );
  });

  it("conserva mensajes ya listos para mostrar", () => {
    expect(friendlyStreamError(new Error("Ya hay una respuesta en curso para esta conversación. Espera a que termine."))).toBe(
      "Ya hay una respuesta en curso para esta conversación. Espera a que termine."
    );
  });

  it("usa el genérico si no es un Error", () => {
    expect(friendlyStreamError("boom")).toBe(
      "No se pudo completar la respuesta. Intenta de nuevo."
    );
  });
});

describe("interpretChatStreamResponse", () => {
  it("mapea 429 y 409", async () => {
    await expect(interpretChatStreamResponse(new Response(null, { status: 429 }))).resolves.toEqual({
      kind: "error",
      message: "Demasiados mensajes seguidos. Espera unos segundos e intenta de nuevo.",
    });
    await expect(interpretChatStreamResponse(new Response(null, { status: 409 }))).resolves.toEqual({
      kind: "error",
      message: "Ya hay una respuesta en curso para esta conversación. Espera a que termine.",
    });
  });

  it("distingue membresía revocada de cuota en 403", async () => {
    await expect(
      interpretChatStreamResponse(
        new Response(JSON.stringify({ error: "Acceso revocado", code: "membership_revoked" }), {
          status: 403,
        })
      )
    ).resolves.toEqual({ kind: "revoked" });

    await expect(
      interpretChatStreamResponse(
        new Response(JSON.stringify({ error: "Alcanzaste tu límite de 40 mensajes este mes." }), {
          status: 403,
        })
      )
    ).resolves.toEqual({
      kind: "error",
      message: "Alcanzaste tu límite de 40 mensajes este mes.",
    });
  });

  it("lee el error de un 4xx/5xx genérico", async () => {
    await expect(
      interpretChatStreamResponse(
        new Response(JSON.stringify({ error: "GPT no encontrado" }), { status: 404 })
      )
    ).resolves.toEqual({ kind: "error", message: "GPT no encontrado" });
  });

  it("acepta 2xx", async () => {
    await expect(interpretChatStreamResponse(new Response(null, { status: 200 }))).resolves.toEqual({
      kind: "ok",
    });
  });
});

describe("clientAttachmentLabel", () => {
  it("resume uno o varios adjuntos", () => {
    expect(clientAttachmentLabel([{ type: "image" }])).toBe("Imagen adjunta");
    expect(clientAttachmentLabel([{ type: "document" }])).toBe("Archivo adjunto");
    expect(clientAttachmentLabel([{ type: "image" }, { type: "image" }])).toBe("2 imágenes adjuntas");
    expect(clientAttachmentLabel([{ type: "image" }, { type: "document" }])).toBe(
      "2 archivos adjuntos"
    );
  });
});
