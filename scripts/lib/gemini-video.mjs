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

// Gemini pricing estimate, USD per 1M tokens — same "adjust if it changes"
// posture as src/lib/pricing.ts, kept separate per the spec (OpenAI/Whisper
// pricing must not silently start covering Gemini calls).
const GEMINI_PRICE_PER_1M_TOKENS = { in: 0.1, out: 0.4 };

export const DESCRIPTION_INSTRUCTION = [
  "Describe this reference video in detail for someone who will write an",
  "image/video generation prompt from it. Cover: composition and framing,",
  "camera movement, subject(s), visual style, any on-screen text, and spoken",
  "dialogue if present. If there is no dialogue or narration, still describe",
  "composition, movement, subject, and style fully from the visuals alone.",
].join(" ");

/**
 * Reject reason, or null. A non-finite durationSeconds REJECTS: an
 * unverifiable duration cannot be proven under the cap without calling
 * Gemini, and the spec forbids that call for a file whose cap compliance is
 * unproven.
 */
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

/** ffprobe stdout -> seconds. Handles "N/A", "", and garbage -> null. */
export function parseFfprobeDuration(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Argv for ffprobe. Throws if absPath is not absolute — that is the guard
 * against a file named "-i" or "--help" being read as a flag: ffprobe has no
 * reliable `--` end-of-options separator, so path.resolve() before this call
 * is the mitigation, not a convention.
 */
export function ffprobeArgs(absPath) {
  if (!isAbsolute(absPath)) {
    throw new Error(`ffprobeArgs requires an absolute path, got: ${absPath}`);
  }
  return ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath];
}

/** Empty, whitespace-only, or implausibly short description -> pilot failure. */
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

/** execFileFn injected (node:child_process execFileSync) per the repo's DI convention. */
export function probeDurationSeconds(execFileFn, absPath) {
  const stdout = execFileFn("ffprobe", ffprobeArgs(absPath), { encoding: "utf8" });
  return parseFfprobeDuration(stdout);
}

const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 30;

/** fetchFn injected so request-building/response-parsing is testable without a live key. */
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

/** fetchFn injected so request-building/response-parsing is testable without a live key. */
export async function describeVideo(fetchFn, apiKey, { fileUri, mimeType }) {
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
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  return {
    text,
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
