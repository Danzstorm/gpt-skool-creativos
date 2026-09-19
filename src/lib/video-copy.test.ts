import { describe, expect, it } from "vitest";
import { MAX_VIDEO_SIZE_MB } from "./upload-limits";
import { VIDEO_ANALYZING_HINT, VIDEO_ANALYZING_LABEL, VIDEO_ATTACH_TITLE } from "./video-copy";

describe("video-copy", () => {
  it("nombra el tope de tamaño y promete transcribir audio", () => {
    expect(VIDEO_ATTACH_TITLE).toContain(`${MAX_VIDEO_SIZE_MB} MB`);
    expect(VIDEO_ATTACH_TITLE.toLowerCase()).toMatch(/transcribe/);
  });

  it("el estado de análisis invita a seguir escribiendo", () => {
    expect(VIDEO_ANALYZING_LABEL.toLowerCase()).toMatch(/transcribiendo/);
    expect(VIDEO_ANALYZING_HINT.toLowerCase()).toMatch(/seguir escribiendo/);
  });
});
