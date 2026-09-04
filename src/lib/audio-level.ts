// Cálculo del nivel que dibuja la onda de grabación.
//
// Vive fuera del componente porque es la parte que no se puede verificar
// mirando: si el ataque es más lento que la caída, o si la normalización deja
// de adaptarse, la onda se ve "casi bien" y nadie sabe por qué. Acá es una
// función pura sobre un estado explícito, y por lo tanto testeable.

/** Ataque rápido / caída lenta: la barra salta con la sílaba y baja despacio. */
export const ATTACK = 0.6;
export const RELEASE = 0.12;

/** Cuánto decae la referencia de pico entre muestras. */
export const PEAK_DECAY = 0.993;

/**
 * Piso de la referencia. Sin esto, en silencio el pico rodante tiende a cero y
 * el ruido de fondo se normalizaría hasta el tope: la onda "bailaría" sola en
 * una habitación callada.
 */
export const MIN_PEAK = 0.025;

export interface LevelState {
  /** Nivel suavizado con ataque/caída. */
  envelope: number;
  /** Referencia contra la que se normaliza. */
  rollingPeak: number;
}

export const INITIAL_LEVEL_STATE: LevelState = {
  envelope: 0,
  rollingPeak: MIN_PEAK,
};

/**
 * Energía media de la ventana (RMS), en 0..1.
 *
 * RMS y no pico: el pico es el valor más alto de la ventana, así que un click
 * del mouse o un golpe de aire lo dispara entero y la onda tiembla. El RMS
 * sigue la energía real de la voz.
 *
 * `samples` viene de `getByteTimeDomainData`: 0..255 con el silencio en 128.
 */
export function rmsOf(samples: Uint8Array | number[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const deviation = (samples[i] - 128) / 128;
    sum += deviation * deviation;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Avanza el estado con una muestra nueva y devuelve el nivel a dibujar (0..1).
 *
 * La normalización contra un pico rodante es lo que hace que la onda se vea
 * igual de viva con un micrófono bajo que con uno alto: en vez de una ganancia
 * fija que hay que calibrar a mano, la referencia se adapta a cada voz.
 */
export function nextLevel(state: LevelState, rms: number): { state: LevelState; level: number } {
  const envelope =
    rms > state.envelope
      ? state.envelope + (rms - state.envelope) * ATTACK
      : state.envelope + (rms - state.envelope) * RELEASE;

  const rollingPeak = Math.max(envelope, state.rollingPeak * PEAK_DECAY, MIN_PEAK);
  const level = Math.min(1, envelope / rollingPeak);

  return { state: { envelope, rollingPeak }, level };
}
