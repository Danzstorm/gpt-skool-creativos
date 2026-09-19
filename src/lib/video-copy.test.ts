import { describe, expect, it } from "vitest";
import { MAX_VIDEO_MINUTES, MAX_VIDEO_SECONDS, MAX_VIDEO_SIZE_MB } from "./upload-limits";
import {
  VIDEO_ANALYZING_HINT,
  VIDEO_ANALYZING_LABEL,
  VIDEO_ATTACH_TITLE,
  formatVideoBadge,
  formatVideoClock,
  videoDurationRejectReason,
} from "./video-copy";

describe("video-copy", () => {
  it("nombra el tope de tamaño y de duración, y promete transcribir audio", () => {
    expect(VIDEO_ATTACH_TITLE).toContain(`${MAX_VIDEO_SIZE_MB} MB`);
    expect(VIDEO_ATTACH_TITLE).toContain(`${MAX_VIDEO_MINUTES} min`);
    expect(VIDEO_ATTACH_TITLE.toLowerCase()).toMatch(/transcribe/);
  });

  it("el estado de análisis invita a seguir escribiendo", () => {
    expect(VIDEO_ANALYZING_LABEL.toLowerCase()).toMatch(/transcribiendo/);
    expect(VIDEO_ANALYZING_HINT.toLowerCase()).toMatch(/seguir escribiendo/);
  });
});

describe("formatVideoBadge", () => {
  it("escribe el reloj compacto del still", () => {
    expect(formatVideoBadge(0)).toBe("0:00");
    expect(formatVideoBadge(5)).toBe("0:05");
    expect(formatVideoBadge(65)).toBe("1:05");
    expect(formatVideoBadge(125.4)).toBe("2:05");
  });
});

describe("videoDurationRejectReason", () => {
  it("deja pasar el tope exacto y una duración ilegible", () => {
    expect(videoDurationRejectReason(MAX_VIDEO_SECONDS)).toBeNull();
    expect(videoDurationRejectReason(null)).toBeNull();
    expect(videoDurationRejectReason(Number.NaN)).toBeNull();
  });

  it("nombra cuánto dura y cuál es el tope", () => {
    const reason = videoDurationRejectReason(MAX_VIDEO_SECONDS + 25);
    expect(reason).toContain(formatVideoClock(MAX_VIDEO_SECONDS + 25));
    expect(reason).toContain(`${MAX_VIDEO_MINUTES} minutos`);
  });
});
