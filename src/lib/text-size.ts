export const TEXT_SIZE_KEY = "creativos-text-size";
export const TEXT_SIZE_MIN = 85;
export const TEXT_SIZE_MAX = 125;
export const TEXT_SIZE_STEP = 5;
export const TEXT_SIZE_DEFAULT = 100;

export function clampTextSize(value: number): number {
  return Math.max(TEXT_SIZE_MIN, Math.min(TEXT_SIZE_MAX, value));
}

export function parseTextSize(raw: string | null): number | null {
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) ? clampTextSize(value) : null;
}

/**
 * Escala el `font-size` de la raíz — no `zoom` (rompe el layout del chat, ver
 * `.chat-zoom` en globals.css) ni un `<style>` por selector (el prototipo del
 * cliente lo hace así porque sus reglas son estáticas; acá casi todo el
 * tamaño de texto ya sale de utilidades Tailwind en `rem`, que escalan solas
 * con la raíz). Efecto visual equivalente con una sola línea.
 */
export function applyTextSize(percent: number): void {
  document.documentElement.style.fontSize = `${percent}%`;
}
