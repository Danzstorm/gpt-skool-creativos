import { describe, expect, it } from "vitest";
import { consumeSSE } from "./stream-client";

/** Arma una Response cuyo body entrega exactamente los trozos dados. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream);
}

const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

describe("consumeSSE — frames de fase", () => {
  it("manda las fases a onPhase y el texto a onToken", async () => {
    const tokens: string[] = [];
    const phases: string[] = [];

    await consumeSSE(
      sseResponse([
        frame({ phase: "queued" }),
        frame({ phase: "code" }),
        frame({ text: "Hola" }),
        frame({ text: " mundo" }),
        "data: [DONE]\n\n",
      ]),
      (t) => tokens.push(t),
      (p) => phases.push(p)
    );

    expect(phases).toEqual(["queued", "code"]);
    expect(tokens.join("")).toBe("Hola mundo");
  });

  it("no rompe cuando el llamador no pasa onPhase", async () => {
    // Este es el caso de GptTestModal, que consume el mismo stream y no
    // muestra indicador. Si el callback opcional no estuviera guardado, un
    // frame de fase lo tumbaría con "onPhase is not a function".
    const tokens: string[] = [];

    await expect(
      consumeSSE(sseResponse([frame({ phase: "code" }), frame({ text: "ok" })]), (t) =>
        tokens.push(t)
      )
    ).resolves.toBeUndefined();

    expect(tokens.join("")).toBe("ok");
  });

  it("propaga el error del servidor como excepción", async () => {
    await expect(
      consumeSSE(sseResponse([frame({ error: "explotó" })]), () => {})
    ).rejects.toThrow("explotó");
  });
});

describe("consumeSSE — bugs de producción ya arreglados que no pueden volver", () => {
  it("reensambla un frame partido entre dos lecturas", async () => {
    // Un frame partido entre dos paquetes TCP (habitual en redes móviles con
    // respuestas largas) dejaba un JSON incompleto y truncaba el stream a
    // mitad de respuesta.
    const completo = frame({ text: "respuesta larga" });
    const corte = Math.floor(completo.length / 2);
    const tokens: string[] = [];

    await consumeSSE(
      sseResponse([completo.slice(0, corte), completo.slice(corte)]),
      (t) => tokens.push(t)
    );

    expect(tokens.join("")).toBe("respuesta larga");
  });

  it("no corrompe un carácter multibyte partido entre lecturas", async () => {
    // `decoder.decode(value)` sin `{ stream: true }` rompía tildes y eñes
    // partidas entre chunks, en una plataforma enteramente en español.
    const bytes = new TextEncoder().encode(frame({ text: "añoración" }));
    const corte = 17; // cae DENTRO de los dos bytes de la "ñ"
    const tokens: string[] = [];

    // Sin esto el test se degrada en silencio: si alguien cambia el texto de
    // prueba y el corte pasa a caer en un borde limpio, sigue en verde sin
    // ejercitar el bug. Aquí se comprueba que el corte de verdad parte un
    // carácter — decodificar el primer trozo suelto tiene que dar U+FFFD.
    const primerTrozoSuelto = new TextDecoder().decode(bytes.slice(0, corte));
    expect(primerTrozoSuelto).toContain("�");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, corte));
        controller.enqueue(bytes.slice(corte));
        controller.close();
      },
    });

    await consumeSSE(new Response(stream), (t) => tokens.push(t));

    expect(tokens.join("")).toBe("añoración");
  });

  it("descarta un frame corrupto sin tumbar el resto del stream", async () => {
    const tokens: string[] = [];

    await consumeSSE(
      sseResponse(["data: {esto no es json}\n\n", frame({ text: "sigue vivo" })]),
      (t) => tokens.push(t)
    );

    expect(tokens.join("")).toBe("sigue vivo");
  });
});
