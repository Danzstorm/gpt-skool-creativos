import { describe, expect, it } from "vitest";
import {
  INITIAL_LEVEL_STATE,
  MIN_PEAK,
  nextLevel,
  rmsOf,
  type LevelState,
} from "./audio-level";

/** Ventana de audio con una onda de amplitud `amp` (0..1) alrededor de 128. */
function tone(amp: number, length = 512): number[] {
  return Array.from({ length }, (_, i) => 128 + Math.sin((i / length) * Math.PI * 32) * 127 * amp);
}

/** Corre `steps` muestras del mismo nivel y devuelve el último resultado. */
function settle(rms: number, steps: number, from: LevelState = INITIAL_LEVEL_STATE) {
  let state = from;
  let level = 0;
  for (let i = 0; i < steps; i++) ({ state, level } = nextLevel(state, rms));
  return { state, level };
}

describe("rmsOf", () => {
  it("da cero en silencio", () => {
    // getByteTimeDomainData centra el silencio en 128, no en 0.
    expect(rmsOf(new Array(512).fill(128))).toBe(0);
  });

  it("crece con la amplitud", () => {
    expect(rmsOf(tone(0.8))).toBeGreaterThan(rmsOf(tone(0.2)));
  });

  it("no explota con una ventana vacía", () => {
    expect(rmsOf([])).toBe(0);
  });

  it("es insensible al signo: importa la energía, no la dirección", () => {
    const arriba = [128, 200, 128, 200];
    const abajo = [128, 56, 128, 56];
    expect(rmsOf(arriba)).toBeCloseTo(rmsOf(abajo), 10);
  });
});

describe("nextLevel — ataque y caída", () => {
  it("sube más rápido de lo que baja", () => {
    // Es lo que hace que la onda dibuje la frase en vez de parpadear entre
    // sílabas. Si alguien iguala las dos constantes, esto lo frena.
    const subida = nextLevel(INITIAL_LEVEL_STATE, 0.5).state.envelope;

    const alto: LevelState = { envelope: 0.5, rollingPeak: 0.5 };
    const bajada = 0.5 - nextLevel(alto, 0).state.envelope;

    expect(subida).toBeGreaterThan(bajada);
  });

  it("reacciona al primer golpe de voz sin esperar varias muestras", () => {
    // Con un ataque lento, el usuario habla y la onda todavía está plana.
    const { level } = nextLevel(INITIAL_LEVEL_STATE, 0.4);
    expect(level).toBeGreaterThan(0.5);
  });
});

describe("nextLevel — normalización", () => {
  it("un micrófono bajo y uno alto llegan al mismo nivel dibujado", () => {
    // Esta es la razón de existir del pico rodante: con ganancia fija, el que
    // habla bajito veía las barras pegadas al piso y el que habla fuerte las
    // veía saturadas.
    const bajo = settle(0.06, 60).level;
    const alto = settle(0.9, 60).level;

    expect(bajo).toBeGreaterThan(0.8);
    expect(alto).toBeGreaterThan(0.8);
    expect(Math.abs(bajo - alto)).toBeLessThan(0.15);
  });

  it("nunca pasa de 1, así la barra no se sale de la pista", () => {
    const { level } = settle(5, 40);
    expect(level).toBeLessThanOrEqual(1);
  });

  it("el silencio se ve como silencio, no como ruido amplificado", () => {
    // Sin MIN_PEAK, el pico rodante tiende a cero en una habitación callada y
    // el ruido de fondo se normalizaría hasta el tope: la onda bailaría sola.
    const casiSilencio = MIN_PEAK / 20;
    const { level } = settle(casiSilencio, 200);
    expect(level).toBeLessThan(0.2);
  });

  it("la referencia baja cuando alguien deja de gritar", () => {
    // Si el pico no decayera, después de un grito toda la conversación normal
    // se vería plana el resto de la grabación.
    const despuesDelGrito = settle(0.9, 40).state;
    const referenciaAlta = despuesDelGrito.rollingPeak;

    const luego = settle(0.15, 300, despuesDelGrito).state;
    expect(luego.rollingPeak).toBeLessThan(referenciaAlta);
  });

  it("la referencia nunca cae por debajo del piso", () => {
    const { state } = settle(0, 5000);
    expect(state.rollingPeak).toBeGreaterThanOrEqual(MIN_PEAK);
  });
});

describe("nextLevel — estabilidad", () => {
  it("es puro: no muta el estado que recibe", () => {
    const state: LevelState = { ...INITIAL_LEVEL_STATE };
    nextLevel(state, 0.7);
    expect(state).toEqual(INITIAL_LEVEL_STATE);
  });

  it("nunca devuelve NaN, ni con entradas absurdas", () => {
    for (const rms of [0, -1, 1e9, Number.EPSILON]) {
      const { level, state } = settle(rms, 20);
      expect(Number.isFinite(level)).toBe(true);
      expect(Number.isFinite(state.envelope)).toBe(true);
      expect(Number.isFinite(state.rollingPeak)).toBe(true);
    }
  });
});
