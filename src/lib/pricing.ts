// Precios OpenAI por 1M de tokens (USD), aproximados. Ajustar si cambian.
// Fuente: pricing público de OpenAI. Solo para estimación de costo interna.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4.1": { in: 2.0, out: 8.0 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "gpt-4o": { in: 2.5, out: 10.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

const DEFAULT = PRICING["gpt-4.1"];

/** Costo estimado en USD de una respuesta dado el modelo y los tokens. */
export function estimateCost(model: string | null, tokensIn: number, tokensOut: number): number {
  const p = (model && PRICING[model]) || DEFAULT;
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}
