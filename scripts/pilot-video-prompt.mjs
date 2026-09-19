#!/usr/bin/env node
// Manual pilot: local reference video -> Gemini description -> existing GPT's
// live prompt. Throwaway script for one client review round, not a production
// path (see the design's "No Production Path Changes" requirement).
//
// Preconditions (both checked at startup, before any video is read):
//   - GEMINI_API_KEY in .env.local (get one at https://aistudio.google.com/app/apikey)
//   - ffmpeg/ffprobe on PATH — validates the 300s cap locally before any Gemini call
//
// Usage: npm run pilot:video -- --gpt <uuid|name> <video1> [video2] [video3]

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  describeVideo,
  descriptionRejectReason,
  estimateGeminiCost,
  probeDurationSeconds,
  uploadVideo,
  videoRejectReason,
} from "./lib/gemini-video.mjs";

const OUTPUT_DIR = "pilot-output";

const MIME_BY_EXT = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const gptIndex = argv.indexOf("--gpt");
  if (gptIndex === -1 || !argv[gptIndex + 1]) {
    fail("Usage: npm run pilot:video -- --gpt <uuid|name> <video1> [video2] [video3]");
  }
  const gptRef = argv[gptIndex + 1];
  const videoPaths = argv.filter((_, i) => i !== gptIndex && i !== gptIndex + 1);
  if (videoPaths.length === 0) {
    fail("No video paths given. Usage: npm run pilot:video -- --gpt <uuid|name> <video1> [video2] [video3]");
  }
  return { gptRef, videoPaths };
}

function requireGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    fail(
      "GEMINI_API_KEY is missing.\n" +
        "Create one at https://aistudio.google.com/app/apikey and add it to .env.local."
    );
  }
  return key;
}

// Probed once at startup, not per video, so a missing ffprobe fails in the
// first second instead of after the first Gemini upload.
function requireFfprobe() {
  try {
    execFileSync("ffprobe", ["-version"], { encoding: "utf8" });
  } catch {
    fail(
      "ffprobe is not installed. This pilot validates video duration locally, before any Gemini call.\n" +
        "Install ffmpeg: `winget install Gyan.FFmpeg` (Windows) or `brew install ffmpeg` (macOS)."
    );
  }
}

/**
 * Same fallback overlay src/lib/gpt-runtime-config.ts applies in production
 * (gpt_private_config wins when present, the legacy `gpts` columns are the
 * fallback) — inlined here rather than imported, since this script runs as
 * bare Node with no src/lib TS import path.
 *
 * The per-field `??` here matches the production overlay's whole-object
 * `data ?? fallback` only because `gpt_private_config.system_prompt`/`.model`
 * are DB-enforced NOT NULL (see supabase/migrations/20260726191712_harden_data_model_phase1.sql):
 * an override row never has a null field to fall through on. If that
 * constraint is ever relaxed, this stops being equivalent.
 */
async function resolveGpt(supabase, gptRef) {
  const { data: gpts, error } = await supabase
    .from("gpts")
    .select("id, name, system_prompt, model")
    .eq("is_active", true);
  if (error) throw error;

  const matches = gpts.filter((g) => g.id === gptRef || g.name === gptRef);
  if (matches.length !== 1) {
    fail(
      `${matches.length === 0 ? "No active GPT matches" : "Multiple active GPTs match"} "${gptRef}".\n` +
        `Active GPTs: ${gpts.map((g) => g.name).join(", ") || "(none)"}`
    );
  }
  const base = matches[0];

  const { data: override, error: overrideError } = await supabase
    .from("gpt_private_config")
    .select("system_prompt, model")
    .eq("gpt_id", base.id)
    .maybeSingle();
  if (overrideError && overrideError.code !== "PGRST205" && overrideError.code !== "42P01") {
    throw overrideError;
  }

  return {
    name: base.name,
    system_prompt: override?.system_prompt ?? base.system_prompt,
    model: override?.model ?? base.model,
  };
}

function mimeTypeFor(path) {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? "video/mp4";
}

function writeReport(videoPath, lines) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const name = basename(videoPath, extname(videoPath));
  const outPath = resolve(OUTPUT_DIR, `${name}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");
  return outPath;
}

function failedReport(videoPath, stage, reason) {
  const outPath = writeReport(videoPath, [
    `# ${basename(videoPath)}`,
    "",
    `**Status**: FAILED (${stage})`,
    `**Reason**: ${reason}`,
  ]);
  console.log(`FAILED  ${videoPath} — ${reason} (${outPath})`);
  return false;
}

async function processVideo({ videoPath, gpt, geminiKey, openai, fetchFn, execFileFn }) {
  const startedAt = Date.now();
  const absPath = resolve(videoPath);
  const sizeBytes = statSync(absPath).size;

  let durationSeconds = null;
  try {
    durationSeconds = probeDurationSeconds(execFileFn, absPath);
  } catch (error) {
    console.error(`ffprobe failed for ${videoPath}: ${error.message}`);
  }

  const capReason = videoRejectReason({ sizeBytes, durationSeconds });
  if (capReason) return failedReport(videoPath, "local cap", capReason);

  try {
    const uploadStart = Date.now();
    const { fileUri, mimeType } = await uploadVideo(fetchFn, geminiKey, {
      filePath: absPath,
      mimeType: mimeTypeFor(absPath),
    });
    const uploadMs = Date.now() - uploadStart;

    const describeStart = Date.now();
    const { text: description, tokensIn, tokensOut } = await describeVideo(fetchFn, geminiKey, {
      fileUri,
      mimeType,
    });
    const describeMs = Date.now() - describeStart;

    const descReason = descriptionRejectReason(description);
    if (descReason) return failedReport(videoPath, "Gemini description", descReason);

    const promptStart = Date.now();
    // Byte-identical to buildUserInput's text-only shape (src/lib/chat-content.ts):
    // no attachments here, so ATTACHMENT_RULES is correctly not appended.
    const response = await openai.responses.create({
      model: gpt.model,
      instructions: gpt.system_prompt,
      input: [{ role: "user", content: [{ type: "input_text", text: description.trim() }] }],
    });
    const promptMs = Date.now() - promptStart;
    const generatedPrompt = response.output_text ?? "";

    const costUsd = estimateGeminiCost(tokensIn, tokensOut);
    const totalMs = Date.now() - startedAt;

    const outPath = writeReport(videoPath, [
      `# ${basename(videoPath)}`,
      "",
      "**Status**: OK",
      `**GPT**: ${gpt.name}`,
      `**Source**: ${absPath}`,
      `**Size**: ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`,
      `**Duration**: ${durationSeconds}s`,
      "",
      "## Gemini description",
      "",
      description,
      "",
      "## Generated prompt",
      "",
      generatedPrompt,
      "",
      "## Metrics",
      "",
      `- Upload: ${uploadMs}ms`,
      `- Describe: ${describeMs}ms`,
      `- Prompt: ${promptMs}ms`,
      `- Total: ${totalMs}ms`,
      `- Gemini tokens: ${tokensIn} in / ${tokensOut} out`,
      `- Estimated Gemini cost: $${costUsd.toFixed(4)}`,
    ]);
    console.log(`OK      ${videoPath} (${outPath})`);
    return true;
  } catch (error) {
    return failedReport(videoPath, "Gemini/OpenAI call", error.message);
  }
}

async function main() {
  const geminiKey = requireGeminiKey();
  requireFfprobe();
  const { gptRef, videoPaths } = parseArgs(process.argv.slice(2));

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const gpt = await resolveGpt(supabase, gptRef);

  let allOk = true;
  for (const videoPath of videoPaths) {
    const ok = await processVideo({
      videoPath,
      gpt,
      geminiKey,
      openai,
      fetchFn: fetch,
      execFileFn: execFileSync,
    });
    if (!ok) allOk = false;
  }

  if (!allOk) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
