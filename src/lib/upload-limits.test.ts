import { describe, expect, it } from "vitest";
import { MAX_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, rejectReason } from "./upload-limits";

describe("rejectReason", () => {
  it("accepts a video within the cap when Gemini is configured", () => {
    expect(rejectReason("video/mp4", MAX_VIDEO_SIZE_BYTES, true)).toBeNull();
  });

  // La razón de ser del flag: sin GEMINI_API_KEY no hay quien describa el video,
  // así que se corta acá — en /upload/sign eso es antes de firmar la subida.
  it("rejects every video when Gemini is not configured, whatever the size", () => {
    expect(rejectReason("video/mp4", 1, false)).toMatch(/no está disponible/);
    expect(rejectReason("video/quicktime", MAX_VIDEO_SIZE_BYTES, false)).toMatch(/no está disponible/);
  });

  it("leaves images and documents alone when video is off", () => {
    expect(rejectReason("image/png", MAX_SIZE_BYTES, false)).toBeNull();
    expect(rejectReason("application/pdf", MAX_SIZE_BYTES, false)).toBeNull();
  });

  it("still applies the size caps and the type allowlist", () => {
    expect(rejectReason("video/mp4", MAX_VIDEO_SIZE_BYTES + 1, true)).toMatch(/límite/);
    expect(rejectReason("image/png", MAX_SIZE_BYTES + 1, true)).toMatch(/límite/);
    expect(rejectReason("application/zip", 10, true)).toMatch(/no permitido/);
  });

  it("acepta audio dentro del tope general", () => {
    expect(rejectReason("audio/mpeg", MAX_SIZE_BYTES, false)).toBeNull();
    expect(rejectReason("audio/webm", MAX_SIZE_BYTES + 1, true)).toMatch(/límite/);
  });
});
