// Puerto a TypeScript de scripts/lib/gemini-video.mjs, adaptado a serverless:
// el original lee el video de disco (readFileSync) porque corre como script
// bare Node; acá el video ya llegó como blob de Supabase Storage, así que
// uploadVideo recibe los bytes en memoria en vez de un filePath.
//
// Modelo y precio por token copiados tal cual del piloto (no inventar
// números): scripts/lib/gemini-video.mjs no se toca, este archivo es la ruta
// nueva de producción (usada por /api/upload/register).
//
// A propósito en su propio módulo y no en src/lib/pricing.ts: ese archivo es
// precios de OpenAI (USD por 1M de tokens de los modelos de chat) y Gemini no
// debe empezar a cubrirse ahí en silencio.

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

const GEMINI_PRICE_PER_1M_TOKENS = { in: 0.1, out: 0.4 };

export function estimateGeminiCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * GEMINI_PRICE_PER_1M_TOKENS.in + (tokensOut / 1_000_000) * GEMINI_PRICE_PER_1M_TOKENS.out;
}

// Cota superior de gasto para RESERVAR antes de llamar a Gemini (mismo patrón
// que worstCaseAudioCost en src/lib/pricing.ts para Whisper): sin duración
// conocida (no hay ffprobe en serverless — ver upload-limits.ts), se asume la
// misma duración "razonable" que el piloto usaba como tope de validación
// local (MAX_VIDEO_SECONDS = 180s en scripts/lib/gemini-video.mjs) y la tasa
// pública de Gemini de ~300 tokens/segundo de video a resolución por defecto.
// No es una cota matemáticamente absoluta (un video de 100MB en muy baja
// resolución puede durar más de 180s), pero es conservadora para el caso real
// de uso (referencias cortas) y evita complicar esto con un parser de
// metadata de video. Ajustar si Gemini cambia su tasa o el tope de duración.
const WORST_CASE_DURATION_SECONDS = 180;
const GEMINI_VIDEO_TOKENS_PER_SECOND = 300;
const WORST_CASE_OUTPUT_TOKENS = 2_000;

export function worstCaseVideoCost(): number {
  const tokensIn = WORST_CASE_DURATION_SECONDS * GEMINI_VIDEO_TOKENS_PER_SECOND;
  return estimateGeminiCost(tokensIn, WORST_CASE_OUTPUT_TOKENS);
}

export const DESCRIPTION_INSTRUCTION = [
  "Describe this reference video in detail for someone who will write an",
  "image/video generation prompt from it. Cover: composition and framing,",
  "camera movement, subject(s), visual style, any on-screen text, and spoken",
  "dialogue if present. If there is no dialogue or narration, still describe",
  "composition, movement, subject, and style fully from the visuals alone.",
].join(" ");

const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 30;

// Firma acotada a como se llama acá siempre (URL ya armada como string) — el
// tipo completo de `typeof fetch` tiene sobrecargas (URL | Request | string)
// que un mock simple de test no puede satisfacer todas a la vez.
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** fetchFn inyectado, mismo criterio DI que el piloto (testeable sin key real). */
export async function uploadVideo(
  fetchFn: FetchFn,
  apiKey: string,
  { bytes, mimeType, displayName }: { bytes: Uint8Array; mimeType: string; displayName: string }
): Promise<{ fileUri: string; mimeType: string }> {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ file: { display_name: displayName } })], { type: "application/json" }));
  // Cast puntual: Uint8Array (sin parametrizar) no encaja en BlobPart en este
  // lib.dom (exige backing ArrayBuffer, no ArrayBufferLike) — los bytes acá
  // siempre vienen de blob.arrayBuffer(), nunca de un SharedArrayBuffer.
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mimeType }));

  const uploadResponse = await fetchFn(`${GEMINI_UPLOAD_URL}?uploadType=multipart&key=${apiKey}`, {
    method: "POST",
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Gemini upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  }
  const uploaded = await uploadResponse.json();
  const name = uploaded.file?.name;
  if (!name) throw new Error("Gemini upload response is missing file.name");

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const pollResponse = await fetchFn(`${GEMINI_API_BASE}/${name}?key=${apiKey}`);
    if (!pollResponse.ok) {
      throw new Error(`Gemini file poll failed: ${pollResponse.status} ${await pollResponse.text()}`);
    }
    const file = await pollResponse.json();
    if (file.state === "ACTIVE") {
      return { fileUri: file.uri, mimeType: file.mimeType ?? mimeType };
    }
    if (file.state === "FAILED") {
      throw new Error(`Gemini file processing failed for ${name}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Gemini file ${name} did not become ACTIVE within ${POLL_MAX_ATTEMPTS} polls`);
}

/** fetchFn inyectado, mismo criterio DI que el piloto. */
export async function describeVideo(
  fetchFn: FetchFn,
  apiKey: string,
  { fileUri, mimeType }: { fileUri: string; mimeType: string }
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const response = await fetchFn(`${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ file_data: { file_uri: fileUri, mime_type: mimeType } }, { text: DESCRIPTION_INSTRUCTION }],
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini generateContent failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("");
  return {
    text,
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
