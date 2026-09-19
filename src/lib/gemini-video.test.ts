import { resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Lives in a .mjs because the pilot script that consumes it runs as bare Node
// (no Next build, no `@/` alias) — see scripts/lib/gemini-video.mjs header.
import {
  DESCRIPTION_INSTRUCTION,
  MAX_VIDEO_MB,
  MAX_VIDEO_SECONDS,
  VIDEO_MAX_OUTPUT_TOKENS,
  VIDEO_MEDIA_RESOLUTION,
  VIDEO_SAMPLE_FPS,
  buildDescribeVideoRequest,
  describeVideo,
  descriptionRejectReason,
  estimateGeminiCost,
  ffprobeArgs,
  parseDescribeVideoResponse,
  parseFfprobeDuration,
  probeDurationSeconds,
  uploadVideo,
  videoRejectReason,
} from "../../scripts/lib/gemini-video.mjs";

describe("videoRejectReason", () => {
  it("accepts a video within both caps", () => {
    expect(videoRejectReason({ sizeBytes: 40 * 1024 * 1024, durationSeconds: 160 })).toBeNull();
  });

  it("accepts a video exactly at the size cap", () => {
    expect(videoRejectReason({ sizeBytes: MAX_VIDEO_MB * 1024 * 1024, durationSeconds: 60 })).toBeNull();
  });

  it("rejects a video one byte over the size cap, naming the limit", () => {
    const reason = videoRejectReason({ sizeBytes: MAX_VIDEO_MB * 1024 * 1024 + 1, durationSeconds: 60 });
    expect(reason).toContain(`${MAX_VIDEO_MB}MB`);
  });

  it("accepts a video exactly at the duration cap", () => {
    expect(videoRejectReason({ sizeBytes: 1024, durationSeconds: MAX_VIDEO_SECONDS })).toBeNull();
  });

  it("rejects a video one second over the duration cap, naming the limit", () => {
    const reason = videoRejectReason({ sizeBytes: 1024, durationSeconds: MAX_VIDEO_SECONDS + 1 });
    expect(reason).toContain(`${MAX_VIDEO_SECONDS}s`);
  });

  it("rejects an unverifiable (null) duration instead of letting it pass", () => {
    expect(videoRejectReason({ sizeBytes: 1024, durationSeconds: null })).not.toBeNull();
  });

  it("rejects an unverifiable (NaN) duration instead of letting it pass", () => {
    expect(videoRejectReason({ sizeBytes: 1024, durationSeconds: NaN })).not.toBeNull();
  });
});

describe("parseFfprobeDuration", () => {
  it("parses a plain numeric stdout line into seconds", () => {
    expect(parseFfprobeDuration("154.23\n")).toBe(154.23);
  });

  it("returns null for ffprobe's N/A output", () => {
    expect(parseFfprobeDuration("N/A\n")).toBeNull();
  });

  it("returns null for empty stdout", () => {
    expect(parseFfprobeDuration("")).toBeNull();
  });

  it("returns null for garbage stdout", () => {
    expect(parseFfprobeDuration("not-a-number")).toBeNull();
  });
});

describe("ffprobeArgs", () => {
  it("throws on a relative path", () => {
    expect(() => ffprobeArgs("video.mp4")).toThrow();
  });

  it("puts the resolved path as the last argument, never a bare flag", () => {
    // A file literally named "-i" would be misread as a flag by ffprobe if
    // passed unresolved. path.resolve() is the guard: the resolved path
    // carries a directory prefix and can never start with "-".
    const dashNamed = resolve("-i");
    const args = ffprobeArgs(dashNamed);
    expect(args.at(-1)).toBe(dashNamed);
    expect(args).not.toContain("-i");
  });
});

describe("descriptionRejectReason", () => {
  it("rejects an empty description", () => {
    expect(descriptionRejectReason("")).not.toBeNull();
  });

  it("rejects a whitespace-only description", () => {
    expect(descriptionRejectReason("   \n  ")).not.toBeNull();
  });

  it("rejects an implausibly short description", () => {
    expect(descriptionRejectReason("A short clip.")).not.toBeNull();
  });

  it("accepts a description with real substance", () => {
    const long =
      "A wide static shot of a kitchen at dawn. A woman in a blue robe walks in, opens the " +
      "fridge, and pours orange juice while narrating her morning routine in a calm voice.";
    expect(descriptionRejectReason(long)).toBeNull();
  });
});

describe("buildDescribeVideoRequest", () => {
  it("pide cronología completa y fija fps, techo de salida y resolución", () => {
    expect(DESCRIPTION_INSTRUCTION).toMatch(/Chronology/i);
    expect(DESCRIPTION_INSTRUCTION).toMatch(/transcribe/i);
    const body = buildDescribeVideoRequest("https://.../files/abc", "video/mp4");
    const videoPart = body.contents[0]?.parts[0];
    expect(videoPart?.video_metadata?.fps).toBe(VIDEO_SAMPLE_FPS);
    expect(videoPart?.media_resolution?.level).toBe(VIDEO_MEDIA_RESOLUTION);
    expect(body.generationConfig.maxOutputTokens).toBe(VIDEO_MAX_OUTPUT_TOKENS);
  });
});

describe("parseDescribeVideoResponse", () => {
  it("omite partes thought y concatena el texto útil", () => {
    expect(
      parseDescribeVideoResponse({
        candidates: [{ content: { parts: [{ thought: true, text: "x" }, { text: "Plano 1." }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
      })
    ).toEqual({ text: "Plano 1.", tokensIn: 3, tokensOut: 2 });
  });
});

describe("estimateGeminiCost", () => {
  it("returns 0 for a call with no tokens", () => {
    expect(estimateGeminiCost(0, 0)).toBe(0);
  });

  it("scales linearly with token counts", () => {
    const oneMillion = estimateGeminiCost(1_000_000, 0);
    const twoMillion = estimateGeminiCost(2_000_000, 0);
    expect(oneMillion).toBeGreaterThan(0);
    expect(twoMillion).toBeCloseTo(oneMillion * 2);
  });

  it("charges output tokens at a different rate than input tokens", () => {
    const inputOnly = estimateGeminiCost(1_000_000, 0);
    const outputOnly = estimateGeminiCost(0, 1_000_000);
    expect(outputOnly).not.toBe(inputOnly);
  });
});

describe("probeDurationSeconds", () => {
  it("returns seconds parsed from the injected execFileFn's stdout", () => {
    const execFileFn = vi.fn(() => "154.23\n");
    const absPath = resolve("clip.mp4");
    expect(probeDurationSeconds(execFileFn, absPath)).toBe(154.23);
    expect(execFileFn).toHaveBeenCalledWith("ffprobe", ffprobeArgs(absPath), expect.any(Object));
  });

  it("returns null when ffprobe reports N/A", () => {
    const execFileFn = vi.fn(() => "N/A\n");
    expect(probeDurationSeconds(execFileFn, resolve("clip.mp4"))).toBeNull();
  });

  it("propagates ENOENT instead of swallowing it", () => {
    const enoent = Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT" });
    const execFileFn = vi.fn(() => {
      throw enoent;
    });
    expect(() => probeDurationSeconds(execFileFn, resolve("clip.mp4"))).toThrow(enoent);
  });
});

describe("uploadVideo / describeVideo (DI, no real network)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gemini-video-test-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uploads multipart, polls until ACTIVE, and returns fileUri/mimeType", async () => {
    const filePath = join(tmpDir, "clip.mp4");
    writeFileSync(filePath, "fake-video-bytes");

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 1) {
        return { ok: true, json: async () => ({ file: { name: "files/abc123" } }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          name: "files/abc123",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
          mimeType: "video/mp4",
          state: "ACTIVE",
        }),
      } as Response;
    });

    const result = await uploadVideo(fetchFn, "test-key", { filePath, mimeType: "video/mp4" });

    expect(result).toEqual({
      fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "video/mp4",
    });
    expect(calls[0].url).toContain("uploadType=multipart");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[1].url).toBe("https://generativelanguage.googleapis.com/v1beta/files/abc123?key=test-key");
  });

  it("throws instead of returning a partial result when the upload response is not ok", async () => {
    const filePath = join(tmpDir, "clip2.mp4");
    writeFileSync(filePath, "fake-video-bytes");

    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }) as Response);

    await expect(uploadVideo(fetchFn, "test-key", { filePath, mimeType: "video/mp4" })).rejects.toThrow();
  });

  it("throws when the Gemini file processing state is FAILED", async () => {
    const filePath = join(tmpDir, "clip3.mp4");
    writeFileSync(filePath, "fake-video-bytes");

    const calls: number[] = [];
    const fetchFn = vi.fn(async () => {
      calls.push(1);
      if (calls.length === 1) {
        return { ok: true, json: async () => ({ file: { name: "files/def456" } }) } as Response;
      }
      return { ok: true, json: async () => ({ name: "files/def456", state: "FAILED" }) } as Response;
    });

    await expect(uploadVideo(fetchFn, "test-key", { filePath, mimeType: "video/mp4" })).rejects.toThrow();
  });

  it("requests generateContent with file_data + instruction, and parses text and token usage", async () => {
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "A cat walks across a sunlit room." }] } }],
        usageMetadata: { promptTokenCount: 1234, candidatesTokenCount: 56 },
      }),
    }) as unknown as Response);

    const result = await describeVideo(fetchFn, "test-key", {
      fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "video/mp4",
    });

    expect(result).toEqual({ text: "A cat walks across a sunlit room.", tokensIn: 1234, tokensOut: 56 });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain(":generateContent");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].file_data).toEqual({
      file_uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mime_type: "video/mp4",
    });
    expect(body.contents[0].parts[0].video_metadata.fps).toBe(VIDEO_SAMPLE_FPS);
    expect(body.generationConfig.maxOutputTokens).toBe(VIDEO_MAX_OUTPUT_TOKENS);
  });

  it("throws instead of returning a degraded description when generateContent fails", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429, text: async () => "quota exceeded" }) as Response);

    await expect(
      describeVideo(fetchFn, "test-key", { fileUri: "https://.../files/x", mimeType: "video/mp4" })
    ).rejects.toThrow();
  });
});
