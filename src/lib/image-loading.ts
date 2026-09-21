/** Mínimo que el prototipo espera en pantalla antes de revelar la foto. */
export const IMAGE_REVEAL_MIN_MS = 2000;
/** Fade de `.image-loading-frame.is-ready` (opacity 280ms). */
export const IMAGE_REVEAL_FADE_MS = 280;

/**
 * Cuánto falta para revelar el tile. El reloj arranca al montar el tile, no
 * cuando llega el decode: así la segunda foto no reinicia la primera y quitar
 * la primera no “contagia” identidad a la que entra después.
 */
export function imageRevealWaitMs(
  startedAt: number,
  now = typeof performance !== "undefined" ? performance.now() : Date.now(),
  minMs = IMAGE_REVEAL_MIN_MS
): number {
  return Math.max(0, minMs - (now - startedAt));
}
