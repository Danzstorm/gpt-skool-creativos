// Puerto a TypeScript de scripts/lib/gemini-video.mjs, adaptado a serverless:
// el original lee el video de disco (readFileSync) porque corre como script
// bare Node; acá el video ya llegó como blob de Supabase Storage, así que
// uploadVideo recibe los bytes en memoria en vez de un filePath.
//
// Modelo, prompt y caps de sample deben coincidir con
// scripts/lib/gemini-video.mjs (el piloto). Este archivo es la ruta de
// producción (usada por /api/upload/register).
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
// local (MAX_VIDEO_SECONDS = 180s en scripts/lib/gemini-video.mjs).
//
// La tasa ya no es el default de Gemini (~100 tok/s a 1 FPS + resolución baja).
// Pedimos 2 FPS y MEDIA_RESOLUTION_HIGH (~258 tok/frame + 32 tok/s de audio
// ≈ 550 tok/s). Ajustar si cambia el sample o el precio.
const WORST_CASE_DURATION_SECONDS = 180;
const GEMINI_VIDEO_TOKENS_PER_SECOND = 550;
const WORST_CASE_OUTPUT_TOKENS = 8_192;

export const VIDEO_SAMPLE_FPS = 2;
export const VIDEO_MAX_OUTPUT_TOKENS = 8_192;
export const VIDEO_MEDIA_RESOLUTION = "MEDIA_RESOLUTION_HIGH";

export function worstCaseVideoCost(): number {
  const tokensIn = WORST_CASE_DURATION_SECONDS * GEMINI_VIDEO_TOKENS_PER_SECOND;
  return estimateGeminiCost(tokensIn, WORST_CASE_OUTPUT_TOKENS);
}

export const DESCRIPTION_INSTRUCTION = [
  "Analyze this ENTIRE video from the first frame to the last. Do not write a short summary",
  "and do not write an image/video generation prompt.",
  "Reply in Spanish. Use this structure:",
  "1) Overview: approximate duration, number of shots, and whether there is spoken dialogue,",
  "narration, music, or only sound effects.",
  "2) Chronology: for every shot or action change, a MM:SS timestamp plus what is on screen",
  "(subjects, wardrobe, props, framing, camera move, lighting, and any on-screen text quoted",
  "verbatim).",
  "3) Audio: transcribe every audible line of dialogue or voice-over verbatim in the original",
  "language. If nobody speaks, say so. Describe relevant music and sound effects.",
  "4) Do not invent scenes, text, or dialogue. If something is unreadable or inaudible, say so.",
  "This is a complete shot-by-shot log for someone who cannot open the file.",
].join(" ");

export type DescribeVideoRequestBody = {
  contents: Array<{
    role: "user";
    parts: Array<
      | {
          file_data: { file_uri: string; mime_type: string };
          video_metadata: { fps: number };
          media_resolution: { level: string };
        }
      | { text: string }
    >;
  }>;
  generationConfig: { maxOutputTokens: number; temperature: number };
};

/** Cuerpo de generateContent. Extraído para testear caps/prompt sin red. */
export function buildDescribeVideoRequest(fileUri: string, mimeType: string): DescribeVideoRequestBody {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            file_data: { file_uri: fileUri, mime_type: mimeType },
            video_metadata: { fps: VIDEO_SAMPLE_FPS },
            media_resolution: { level: VIDEO_MEDIA_RESOLUTION },
          },
          { text: DESCRIPTION_INSTRUCTION },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: VIDEO_MAX_OUTPUT_TOKENS, temperature: 0.2 },
  };
}

export function parseDescribeVideoResponse(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}): { text: string; tokensIn: number; tokensOut: number } {
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
  return {
    text,
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

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
    body: JSON.stringify(buildDescribeVideoRequest(fileUri, mimeType)),
  });
  if (!response.ok) {
    throw new Error(`Gemini generateContent failed: ${response.status} ${await response.text()}`);
  }
  return parseDescribeVideoResponse(await response.json());
}
