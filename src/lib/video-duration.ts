export type BrowserVideoPreview = {
  durationSeconds: number | null;
  /** Object URL de un JPEG del primer cuadro. El caller lo revoca. */
  posterUrl?: string;
};

const POSTER_MAX_EDGE = 320;
const POSTER_SEEK_TIMEOUT_MS = 2000;

function revokeVideoSrc(video: HTMLVideoElement, objectUrl: string) {
  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(objectUrl);
}

function canvasPoster(video: HTMLVideoElement): Promise<string | undefined> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return Promise.resolve(undefined);

  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(undefined);

  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? URL.createObjectURL(blob) : undefined),
      "image/jpeg",
      0.72
    );
  });
}

/**
 * Duración + poster del primer cuadro. Un solo decode: antes se leía
 * solo la duración y el menú `@` no tenía still para distinguir clips.
 */
export function probeBrowserVideoPreview(file: Blob): Promise<BrowserVideoPreview> {
  if (typeof document === "undefined") return Promise.resolve({ durationSeconds: null });

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const finish = (preview: BrowserVideoPreview) => {
      revokeVideoSrc(video, objectUrl);
      resolve(preview);
    };

    video.onerror = () => finish({ durationSeconds: null });
    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;
      const seekTo = durationSeconds && durationSeconds > 0.3 ? 0.15 : 0;
      let settled = false;

      const done = (posterUrl?: string) => {
        if (settled) return;
        settled = true;
        finish({ durationSeconds, posterUrl });
      };

      const timer = window.setTimeout(() => done(), POSTER_SEEK_TIMEOUT_MS);
      video.addEventListener(
        "seeked",
        () => {
          window.clearTimeout(timer);
          void canvasPoster(video).then(done);
        },
        { once: true }
      );

      try {
        video.currentTime = seekTo;
      } catch {
        window.clearTimeout(timer);
        done();
      }
    };

    video.src = objectUrl;
  });
}

/** Lee la duración desde metadata del navegador. Sin document (SSR/tests) → null. */
export function probeBrowserVideoDuration(file: Blob): Promise<number | null> {
  return probeBrowserVideoPreview(file).then((preview) => {
    if (preview.posterUrl) URL.revokeObjectURL(preview.posterUrl);
    return preview.durationSeconds;
  });
}
