// Precios OpenAI por 1M de tokens (USD), aproximados. Ajustar si cambian.
// Fuente: pricing público de OpenAI. Solo para estimación de costo interna.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4.1": { in: 2.0, out: 8.0 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "gpt-4o": { in: 2.5, out: 10.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  // Familia GPT-5 (Responses API)
  "gpt-5.4": { in: 2.5, out: 15.0 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  "gpt-5.4-nano": { in: 0.2, out: 1.25 },
  "gpt-5-mini": { in: 0.25, out: 2.0 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
  // GPT-5.6: nomenclatura nueva de OpenAI (Sol/Terra/Luna en vez de nano/mini).
  // Luna es el tramo barato/liviano. Precio de contexto corto; el largo
  // ($0.40/$1.80) no está modelado acá — este estimador no distingue por
  // longitud de contexto para ningún modelo, no solo para este.
  "gpt-5.6-luna": { in: 0.2, out: 1.2 },
};

// Default conservador (mini, no el más caro): si un modelo no se reconoce, no
// infla la métrica 5x como pasaba antes con gpt-4.1.
const DEFAULT = PRICING["gpt-4.1-mini"];

// OpenAI devuelve el modelo con fecha (p.ej. "gpt-4.1-mini-2025-04-14"), que NO
// matchea la clave exacta "gpt-4.1-mini". Se resuelve por el prefijo más largo
// que coincida (así "gpt-4.1-mini-2025-04-14" → "gpt-4.1-mini", no "gpt-4.1").
function resolveModelKey(model: string | null): string | null {
  if (!model) return null;
  if (PRICING[model]) return model;
  let best: string | null = null;
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key) && (best === null || key.length > best.length)) best = key;
  }
  return best;
}

/** Costo estimado en USD de una respuesta dado el modelo y los tokens. */
export function estimateCost(model: string | null, tokensIn: number, tokensOut: number): number {
  const key = resolveModelKey(model);
  const p = (key && PRICING[key]) || DEFAULT;
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

// Whisper se factura por minuto de audio, no por token, así que no entra en
// PRICING (que es USD por 1M de tokens). Precio público: $0.006/minuto.
const WHISPER_USD_PER_MINUTE = 0.006;

/**
 * Costo en USD de una transcripción, a partir de la duración REAL del audio.
 * whisper-1 devuelve `duration` cuando se pide `response_format: "verbose_json"`,
 * así que esto no es una estimación por bytes: es el dato exacto que factura
 * OpenAI. Sin esto el gasto de audio no aparecía en ningún lado.
 */
export function audioCost(durationSeconds: number): number {
  return (durationSeconds / 60) * WHISPER_USD_PER_MINUTE;
}

// Bitrate por debajo de cualquier cosa que produzca un navegador grabando
// (MediaRecorder ronda los 48kbps). Sirve para acotar por arriba cuánto audio
// puede esconder un archivo de N bytes, que es lo que hace falta para reservar
// gasto ANTES de conocer la duración real.
const WORST_CASE_BITRATE_KBPS = 24;

/** Cota superior del coste de transcribir un archivo, a partir de su tamaño. */
export function worstCaseAudioCost(sizeBytes: number): number {
  const seconds = (sizeBytes * 8) / (WORST_CASE_BITRATE_KBPS * 1000);
  return audioCost(seconds);
}
