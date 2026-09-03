import { describe, expect, it } from "vitest";
import { audioCost, estimateCost, worstCaseAudioCost } from "./pricing";

describe("estimateCost", () => {
  it("resuelve el modelo por el prefijo MÁS LARGO, no por el primero que encaje", () => {
    // OpenAI devuelve el modelo con fecha. Si se resolviera por el primer
    // prefijo que coincide, "gpt-4.1-mini-2025-04-14" caería en "gpt-4.1" y el
    // coste saldría 5x inflado.
    const mini = estimateCost("gpt-4.1-mini-2025-04-14", 1_000_000, 0);
    const full = estimateCost("gpt-4.1", 1_000_000, 0);

    expect(mini).toBeCloseTo(0.4, 10);
    expect(full).toBeCloseTo(2.0, 10);
  });

  it("cae al precio de mini ante un modelo desconocido", () => {
    // Default conservador a propósito: un modelo sin tarifa no debe inflar la
    // métrica. Es silencioso, así que este test es el único aviso de que la
    // tabla se quedó corta.
    expect(estimateCost("modelo-que-no-existe", 1_000_000, 1_000_000)).toBeCloseTo(0.4 + 1.6, 10);
  });

  it("suma entrada y salida a su tarifa respectiva", () => {
    expect(estimateCost("gpt-4.1-mini", 500_000, 250_000)).toBeCloseTo(0.2 + 0.4, 10);
  });

  it("no rompe con un modelo nulo", () => {
    expect(estimateCost(null, 0, 0)).toBe(0);
  });
});

describe("audioCost", () => {
  it("cobra por minuto de audio", () => {
    expect(audioCost(60)).toBeCloseTo(0.006, 10);
    expect(audioCost(0)).toBe(0);
  });
});

describe("worstCaseAudioCost", () => {
  // Esta es la garantía de la que depende el presupuesto de /api/transcribe: la
  // reserva se escribe ANTES de conocer la duración real, así que si el peor
  // caso se quedara corto el tope se podría superar sin que nadie lo viera.
  it("acota por arriba el coste real de cualquier audio de navegador", () => {
    const oneMegabyte = 1024 * 1024;

    // MediaRecorder ronda los 48kbps; se prueba también un códec de voz muy
    // comprimido (32kbps) para no depender del caso cómodo.
    for (const bitrateKbps of [32, 48, 64, 128]) {
      const realSeconds = (oneMegabyte * 8) / (bitrateKbps * 1000);
      expect(worstCaseAudioCost(oneMegabyte)).toBeGreaterThanOrEqual(audioCost(realSeconds));
    }
  });

  it("crece con el tamaño y vale cero para un archivo vacío", () => {
    expect(worstCaseAudioCost(0)).toBe(0);
    expect(worstCaseAudioCost(2 * 1024 * 1024)).toBeGreaterThan(worstCaseAudioCost(1024 * 1024));
  });

  it("mantiene una sola transcripción por debajo del presupuesto diario", () => {
    // Con el tope de subida en 10MB, ninguna petición puede agotar por sí sola
    // el presupuesto de $0.60/día: si dejara de cumplirse, el primer audio del
    // día bloquearía al usuario hasta el día siguiente.
    expect(worstCaseAudioCost(10 * 1024 * 1024)).toBeLessThan(0.6);
  });
});
