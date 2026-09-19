// Pure and DI logic for the video-description pilot. Lives in a .mjs because
// the runner that consumes it (scripts/pilot-video-prompt.mjs) executes as
// bare Node — no Next build, no `@/` alias, same reason scripts/lib/orphan-files.mjs
// is not under src/lib. Tested from src/lib/gemini-video.test.ts via relative
// import (vitest.config.mts only globs src/**/*.test.ts).

import { isAbsolute } from "node:path";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export const MAX_VIDEO_MB = 100;
export const MAX_VIDEO_SECONDS = 180;

const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

const MIN_DESCRIPTION_CHARS = 80;

const GEMINI_PRICE_PER_1M_TOKENS = { in: 0.1, out: 0.4 };

export const VIDEO_SAMPLE_FPS = 1;
export const VIDEO_MAX_OUTPUT_TOKENS = 8_192;

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

export const DESCRIPTION_INSTRUCTION = TRANSCRIPT_INSTRUCTION;

export function buildDescribeVideoRequest(fileUri, mimeType, instruction = TRANSCRIPT_INSTRUCTION) {
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

export function parseDescribeVideoResponse(data) {
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

export function mergeVideoAnalysis({ transcript, visual }) {
  const audio = (transcript ?? "").trim() || "No hay habla ni letra audible.";
  const pictures = (visual ?? "").trim() || "(sin cronología visual)";
  return `## TRANSCRIPCIÓN\n\n${audio}\n\n## CRONOLOGÍA VISUAL\n\n${pictures}`;
}

export function videoRejectReason({ sizeBytes, durationSeconds }) {
  if (sizeBytes > MAX_VIDEO_BYTES) {
    return `video exceeds the ${MAX_VIDEO_MB}MB size cap (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB)`;
  }
  if (!Number.isFinite(durationSeconds)) {
    return `video duration could not be determined locally — cannot verify the ${MAX_VIDEO_SECONDS}s cap without calling Gemini`;
  }
  if (durationSeconds > MAX_VIDEO_SECONDS) {
    return `video exceeds the ${MAX_VIDEO_SECONDS}s duration cap (${durationSeconds}s)`;
  }
  return null;
}

export function parseFfprobeDuration(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function ffprobeArgs(absPath) {
  if (!isAbsolute(absPath)) {
    throw new Error(`ffprobeArgs requires an absolute path, got: ${absPath}`);
  }
  return ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath];
}

export function descriptionRejectReason(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "Gemini returned an empty description";
  if (trimmed.length < MIN_DESCRIPTION_CHARS) {
    return `Gemini description is implausibly short (${trimmed.length} chars, expected at least ${MIN_DESCRIPTION_CHARS})`;
  }
  return null;
}

export function estimateGeminiCost(tokensIn, tokensOut) {
  return (tokensIn / 1_000_000) * GEMINI_PRICE_PER_1M_TOKENS.in + (tokensOut / 1_000_000) * GEMINI_PRICE_PER_1M_TOKENS.out;
}

export function probeDurationSeconds(execFileFn, absPath) {
  const stdout = execFileFn("ffprobe", ffprobeArgs(absPath), { encoding: "utf8" });
  return parseFfprobeDuration(stdout);
}

const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const POLL_INTERVAL_MS = 800;
const POLL_MAX_ATTEMPTS = 40;

export async function uploadVideo(fetchFn, apiKey, { filePath, mimeType }) {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ file: { display_name: basename(filePath) } })], { type: "application/json" })
  );
  form.append("file", new Blob([bytes], { type: mimeType }));

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

async function generateFromVideo(fetchFn, apiKey, fileUri, mimeType, instruction) {
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

export async function describeVideo(fetchFn, apiKey, { fileUri, mimeType }) {
  const [transcriptResult, visualResult] = await Promise.allSettled([
    generateFromVideo(fetchFn, apiKey, fileUri, mimeType, TRANSCRIPT_INSTRUCTION),
    generateFromVideo(fetchFn, apiKey, fileUri, mimeType, VISUAL_INSTRUCTION),
  ]);
  if (transcriptResult.status === "rejected" && visualResult.status === "rejected") {
    throw transcriptResult.reason;
  }
  const transcript =
    transcriptResult.status === "fulfilled" ? transcriptResult.value : { text: "", tokensIn: 0, tokensOut: 0 };
  const visual = visualResult.status === "fulfilled" ? visualResult.value : { text: "", tokensIn: 0, tokensOut: 0 };
  return {
    text: mergeVideoAnalysis({ transcript: transcript.text, visual: visual.text }),
    tokensIn: transcript.tokensIn + visual.tokensIn,
    tokensOut: transcript.tokensOut + visual.tokensOut,
  };
}
