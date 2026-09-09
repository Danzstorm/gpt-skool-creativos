import { describe, expect, it, vi } from "vitest";
import { describeVideo, estimateGeminiCost, uploadVideo, worstCaseVideoCost } from "./gemini-upload";

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
});

describe("worstCaseVideoCost", () => {
  it("is a positive, small constant (reservation ceiling, not a real bill)", () => {
    const cost = worstCaseVideoCost();
    expect(cost).toBeGreaterThan(0);
    // 180s * 300 tok/s in + 2000 tok out, at $0.1/$0.4 per 1M — sanity bound
    // well above what a real short reference-video description costs, well
    // below "this reservation could ever look like a billing bug".
    expect(cost).toBeLessThan(0.05);
  });
});

describe("uploadVideo (DI, no real network)", () => {
  it("uploads multipart from in-memory bytes, polls until ACTIVE, and returns fileUri/mimeType", async () => {
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

    const result = await uploadVideo(fetchFn, "test-key", {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "video/mp4",
      displayName: "clip.mp4",
    });

    expect(result).toEqual({
      fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "video/mp4",
    });
    expect(calls[0].url).toContain("uploadType=multipart");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[1].url).toBe("https://generativelanguage.googleapis.com/v1beta/files/abc123?key=test-key");
  });

  it("throws instead of returning a partial result when the upload response is not ok", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }) as Response);

    await expect(
      uploadVideo(fetchFn, "test-key", { bytes: new Uint8Array([1]), mimeType: "video/mp4", displayName: "x.mp4" })
    ).rejects.toThrow();
  });

  it("throws when the Gemini file processing state is FAILED", async () => {
    let call = 0;
    const fetchFn = vi.fn(async () => {
      call++;
      if (call === 1) return { ok: true, json: async () => ({ file: { name: "files/def456" } }) } as Response;
      return { ok: true, json: async () => ({ name: "files/def456", state: "FAILED" }) } as Response;
    });

    await expect(
      uploadVideo(fetchFn, "test-key", { bytes: new Uint8Array([1]), mimeType: "video/mp4", displayName: "x.mp4" })
    ).rejects.toThrow();
  });
});

describe("describeVideo (DI, no real network)", () => {
  it("requests generateContent with file_data + instruction, and parses text and token usage", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => ({
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
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.contents[0].parts[0].file_data).toEqual({
      file_uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mime_type: "video/mp4",
    });
  });

  it("throws instead of returning a degraded description when generateContent fails", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429, text: async () => "quota exceeded" }) as Response);

    await expect(
      describeVideo(fetchFn, "test-key", { fileUri: "https://.../files/x", mimeType: "video/mp4" })
    ).rejects.toThrow();
  });
});
