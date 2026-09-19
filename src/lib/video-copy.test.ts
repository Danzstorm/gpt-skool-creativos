import { describe, expect, it } from "vitest";
import { MAX_VIDEO_SIZE_MB } from "./upload-limits";
import { VIDEO_ANALYZING_HINT, VIDEO_ANALYZING_LABEL, VIDEO_ATTACH_TITLE } from "./video-copy";

describe("video-copy", () => {
  it("nombra el tope de tamaño y niega transcripción verbatim", () => {
    expect(VIDEO_ATTACH_TITLE).toContain(`${MAX_VIDEO_SIZE_MB} MB`);
    expect(VIDEO_ATTACH_TITLE.toLowerCase()).toMatch(/no es transcripci[oó]n/);
  });

  it("el estado de análisis habla de escenas y audio, no de transcribir todo", () => {
    expect(VIDEO_ANALYZING_LABEL.toLowerCase()).toContain("escenas");
    expect(VIDEO_ANALYZING_LABEL.toLowerCase()).toContain("audio");
    expect(VIDEO_ANALYZING_HINT.toLowerCase()).toMatch(/no es transcripci[oó]n/);
  });
});
