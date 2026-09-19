// Puerto a TypeScript de scripts/lib/gemini-video.mjs, adaptado a serverless:
// el original lee el video de disco (readFileSync) porque corre como script
// bare Node; acá el video ya llegó como blob de Supabase Storage, así que
// uploadVideo recibe los bytes en memoria en vez de un filePath.
//
// Prompt, caps y las dos llamadas paralelas (transcripción + visual) deben
// coincidir con scripts/lib/gemini-video.mjs. Este archivo es la ruta de
// producción (usada por /api/upload/register).
//
// A propósito en su propio módulo y no en src/lib/pricing.ts: ese archivo es
// precios de OpenAI (USD por 1M de tokens de los modelos de chat) y Gemini no
// debe empezar a cubrirse ahí en silencio.

import { MAX_VIDEO_SECONDS } from "./upload-limits";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

const GEMINI_PRICE_PER_1M_TOKENS = { in: 0.1, out: 0.4 };

export function estimateGeminiCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * GEMINI_PRICE_PER_1M_TOKENS.in + (tokensOut / 1_000_000) * GEMINI_PRICE_PER_1M_TOKENS.out;
}

// Dos generateContent en paralelo sobre el mismo archivo (audio + visual).
// 1 FPS, sin MEDIA_RESOLUTION_HIGH: HIGH+2fps pasó un clip de prueba de ~6s
// a ~37s. Reserva 2× el input de MAX_VIDEO_SECONDS × 300 tok/s.
const WORST_CASE_DURATION_SECONDS = MAX_VIDEO_SECONDS;
const GEMINI_VIDEO_TOKENS_PER_SECOND = 300;
const DESCRIBE_PASSES = 2;
const WORST_CASE_OUTPUT_TOKENS = 8_192 * DESCRIBE_PASSES;

export const VIDEO_SAMPLE_FPS = 1;
export const VIDEO_MAX_OUTPUT_TOKENS = 8_192;

export function worstCaseVideoCost(): number {
  const tokensIn = WORST_CASE_DURATION_SECONDS * GEMINI_VIDEO_TOKENS_PER_SECOND * DESCRIBE_PASSES;
  return estimateGeminiCost(tokensIn, WORST_CASE_OUTPUT_TOKENS);
}

export const TRANSCRIPT_INSTRUCTION = [
  "Listen only. There may be a song, jingle, or voice mixed under engines or SFX.",
  "Output ONLY a word-for-word transcript of every spoken or sung line in the original",
  "language, one line per utterance, prefixed with MM:SS. Do not paraphrase.",
  "Do not describe the picture. If you hear singing you MUST quote the lyrics — do not",
  "call it instrumental. If a word is unclear write [inaudible]. If and only if there",
  "is truly no human voice, output exactly: No hay habla ni letra audible.",
].join(" ");

export const VISUAL_INSTRUCTION = [
  "Ignore writing a generation prompt. Reply in Spanish. Output a shot-by-shot visual",
  "log of the ENTIRE video. For every shot or action change: MM:SS, subjects, wardrobe,",
  "framing, camera move, lighting, and any on-screen text quoted verbatim.",
  "Do not invent scenes. Do not transcribe audio here.",
].join(" ");

/** Alias para tests/piloto que aún buscan un solo instruction string. */
export const DESCRIPTION_INSTRUCTION = TRANSCRIPT_INSTRUCTION;

export type VideoRequestPart = {
  file_data: { file_uri: string; mime_type: string };
  video_metadata: { fps: number };
};

export type DescribeVideoRequestBody = {
  contents: Array<{
    role: "user";
    parts: Array<VideoRequestPart | { text: string }>;
  }>;
  generationConfig: { maxOutputTokens: number; temperature: number };
};

export function buildDescribeVideoRequest(
  fileUri: string,
  mimeType: string,
  instruction: string = TRANSCRIPT_INSTRUCTION
): DescribeVideoRequestBody {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            file_data: { file_uri: fileUri, mime_type: mimeType },
            video_metadata: { fps: VIDEO_SAMPLE_FPS },
          },
          { text: instruction },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: VIDEO_MAX_OUTPUT_TOKENS, temperature: 0.1 },
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

export function mergeVideoAnalysis({
  transcript,
  visual,
}: {
  transcript: string;
  visual: string;
}): string {
  const audio = transcript.trim() || "No hay habla ni letra audible.";
  const pictures = visual.trim() || "(sin cronología visual)";
  return `## TRANSCRIPCIÓN\n\n${audio}\n\n## CRONOLOGÍA VISUAL\n\n${pictures}`;
}

const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_INTERVAL_MS = 800;
const POLL_MAX_ATTEMPTS = 40;

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function generateFromVideo(
  fetchFn: FetchFn,
  apiKey: string,
  fileUri: string,
  mimeType: string,
  instruction: string
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const response = await fetchFn(`${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildDescribeVideoRequest(fileUri, mimeType, instruction)),
  });
  if (!response.ok) {
    throw new Error(`Gemini generateContent failed: ${response.status} ${await response.text()}`);
  }
  return parseDescribeVideoResponse(await response.json());
}

/** fetchFn inyectado, mismo criterio DI que el piloto (testeable sin key real). */
export async function uploadVideo(
  fetchFn: FetchFn,
  apiKey: string,
  { bytes, mimeType, displayName }: { bytes: Uint8Array; mimeType: string; displayName: string }
): Promise<{ fileUri: string; mimeType: string }> {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ file: { display_name: displayName } })], { type: "application/json" }));
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

/** Transcripción y visual en paralelo sobre el mismo fileUri. */
export async function describeVideo(
  fetchFn: FetchFn,
  apiKey: string,
  { fileUri, mimeType }: { fileUri: string; mimeType: string }
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const [transcriptResult, visualResult] = await Promise.allSettled([
    generateFromVideo(fetchFn, apiKey, fileUri, mimeType, TRANSCRIPT_INSTRUCTION),
    generateFromVideo(fetchFn, apiKey, fileUri, mimeType, VISUAL_INSTRUCTION),
  ]);
  if (transcriptResult.status === "rejected" && visualResult.status === "rejected") {
    throw transcriptResult.reason;
  }
  const transcript = transcriptResult.status === "fulfilled" ? transcriptResult.value : { text: "", tokensIn: 0, tokensOut: 0 };
  const visual = visualResult.status === "fulfilled" ? visualResult.value : { text: "", tokensIn: 0, tokensOut: 0 };
  return {
    text: mergeVideoAnalysis({ transcript: transcript.text, visual: visual.text }),
    tokensIn: transcript.tokensIn + visual.tokensIn,
    tokensOut: transcript.tokensOut + visual.tokensOut,
  };
}
