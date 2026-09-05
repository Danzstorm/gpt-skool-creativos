import type OpenAI from "openai";

// Barato y sin razonamiento: esto resume un intercambio en unas pocas
// palabras, no vale ni el costo ni la latencia de un modelo grande.
const TITLE_MODEL = "gpt-4.1-nano";

// Cuánto del mensaje/respuesta se manda al modelo de título: alcanza para el
// tema y evita pagar tokens de entrada por un documento entero pegado o una
// respuesta larguísima.
const MAX_INPUT_CHARS = 600;

// Es una llamada auxiliar y cosmética que corre DENTRO de onComplete, antes
// de que el stream emita [DONE] y el composer del usuario se desbloquee. Un
// colgue de red hacia OpenAI acá no puede demorar indefinidamente un turno
// que, para el usuario, ya terminó — de ahí el timeout corto y cero reintentos
// (un reintento del SDK duplicaría el peor caso).
const TITLE_REQUEST_OPTIONS = { timeout: 5_000, maxRetries: 0 };

const TITLE_INSTRUCTIONS = [
  "Generás títulos cortos para una lista de conversaciones, como las pestañas",
  "del historial de un chat.",
  "",
  "A partir del mensaje del usuario y la respuesta del asistente, devolvé",
  "ÚNICAMENTE un título de 3 a 6 palabras que resuma el tema central.",
  "En español, sin comillas, sin punto final, sin explicar nada más.",
].join("\n");

function clip(text: string): string {
  return text.length > MAX_INPUT_CHARS ? `${text.slice(0, MAX_INPUT_CHARS)}…` : text;
}

/**
 * Saca comillas y puntuación final que el modelo a veces agrega igual pese a
 * la instrucción, y pone un techo defensivo de largo.
 */
export function cleanGeneratedTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim()
    .slice(0, 60);
}

export interface ThreadTitleResult {
  title: string;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Título interpretado para un chat nuevo (al estilo ChatGPT/Claude), en vez
 * del mensaje del usuario cortado a lo bruto.
 *
 * Devuelve null —nunca lanza por un resultado vacío— cuando el modelo no dio
 * nada usable, para que quien llama pueda caer al truncado de siempre. Sí
 * puede lanzar por un fallo de red o de la API: eso lo decide el caller.
 *
 * Recibe el cliente de OpenAI por parámetro (no lo instancia acá) para que
 * este módulo se pueda importar en tests sin `OPENAI_API_KEY` — mismo motivo
 * por el que message-attachments.ts recibe su cliente de Supabase así.
 */
export async function generateThreadTitle(
  openai: OpenAI,
  userMessage: string,
  assistantText: string
): Promise<ThreadTitleResult | null> {
  const response = await openai.responses.create(
    {
      model: TITLE_MODEL,
      instructions: TITLE_INSTRUCTIONS,
      input: `Mensaje del usuario:\n${clip(userMessage)}\n\nRespuesta del asistente:\n${clip(assistantText)}`,
    },
    TITLE_REQUEST_OPTIONS
  );

  const title = cleanGeneratedTitle(response.output_text ?? "");
  if (!title) return null;

  return {
    title,
    model: response.model ?? null,
    tokensIn: response.usage?.input_tokens ?? 0,
    tokensOut: response.usage?.output_tokens ?? 0,
  };
}
