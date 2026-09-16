import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import {
  applyOpenAiAttachmentPolicy,
  buildCodeInterpreterTools,
  mapUploadedRowsToIncoming,
  messageAttachmentLabel,
  OPENAI_ATTACHMENT_UNAVAILABLE_ERROR,
  recentlyRegisteredFileIds,
  RECENTLY_REGISTERED_MS,
  visionRejectsImages,
  VISION_DISABLED_ERROR,
} from "./chat-request";
import type { IncomingFile } from "./chat-content";

vi.mock("./conversation-sync", () => ({
  keepAvailableFiles: vi.fn(
    async (
      _openai: OpenAI,
      files: Array<{ openai_file_id: string }>,
      _options?: { trustIds?: ReadonlySet<string> }
    ) => files.slice(0, 1)
  ),
}));

import { keepAvailableFiles } from "./conversation-sync";

const img: IncomingFile = { openai_file_id: "img-1", type: "image" };
const doc: IncomingFile = { openai_file_id: "doc-1", type: "document", name: "brief.pdf" };
const vid: IncomingFile = {
  openai_file_id: "vid-1",
  type: "video",
  name: "demo.mp4",
  videoDescription: "alguien habla",
};

describe("messageAttachmentLabel", () => {
  it("resume un solo adjunto", () => {
    expect(messageAttachmentLabel([img])).toBe("Imagen adjunta");
    expect(messageAttachmentLabel([doc])).toBe("Archivo adjunto");
  });

  it("resume varios adjuntos homogéneos o mixtos", () => {
    expect(messageAttachmentLabel([img, img])).toBe("2 imágenes adjuntas");
    expect(messageAttachmentLabel([doc, vid])).toBe("2 archivos adjuntos");
  });
});

describe("mapUploadedRowsToIncoming", () => {
  it("tipifica por MIME y conserva nombre/descripcion donde corresponde", () => {
    const rows = [
      { openai_file_id: "a", mime: "image/png", name: "foto.png", video_description: null },
      { openai_file_id: "b", mime: "application/pdf", name: "brief.pdf", video_description: null },
      {
        openai_file_id: "c",
        mime: "video/mp4",
        name: "demo.mp4",
        video_description: "escena intro",
      },
    ];
    expect(mapUploadedRowsToIncoming(["a", "b", "c"], rows)).toEqual([
      { openai_file_id: "a", type: "image" },
      { openai_file_id: "b", type: "document", name: "brief.pdf" },
      {
        openai_file_id: "c",
        type: "video",
        name: "demo.mp4",
        videoDescription: "escena intro",
      },
    ]);
  });
});

describe("visionRejectsImages", () => {
  it("bloquea imágenes cuando vision_enabled es false", () => {
    expect(visionRejectsImages(false, [img])).toBe(true);
    expect(visionRejectsImages(true, [img])).toBe(false);
    expect(visionRejectsImages(false, [doc, vid])).toBe(false);
  });

  it("expone el mensaje de error usado por las rutas", () => {
    expect(VISION_DISABLED_ERROR).toBe("Este GPT no admite imágenes");
  });
});

describe("buildCodeInterpreterTools", () => {
  it("incluye file_ids solo cuando hay documentos", () => {
    expect(buildCodeInterpreterTools([img])).toEqual([
      { type: "code_interpreter", container: { type: "auto" } },
    ]);
    expect(buildCodeInterpreterTools([doc, img])).toEqual([
      {
        type: "code_interpreter",
        container: { type: "auto", file_ids: ["doc-1"] },
      },
    ]);
  });
});

describe("recentlyRegisteredFileIds", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");

  it("incluye archivos registrados hace poco", () => {
    const ids = recentlyRegisteredFileIds(
      [
        {
          openai_file_id: "fresh",
          created_at: new Date(now - 30_000).toISOString(),
        },
        {
          openai_file_id: "old",
          created_at: new Date(now - RECENTLY_REGISTERED_MS - 1).toISOString(),
        },
      ],
      now
    );
    expect([...ids]).toEqual(["fresh"]);
  });
});

describe("applyOpenAiAttachmentPolicy", () => {
  const openai = {} as OpenAI;

  it("omite retrieve para adjuntos recién registrados", async () => {
    vi.mocked(keepAvailableFiles).mockImplementationOnce(async (_openai, files, options?) => {
      expect(options?.trustIds).toEqual(new Set(["fresh-doc"]));
      return files;
    });
    const result = await applyOpenAiAttachmentPolicy(openai, [doc], "strict", {
      skipOpenAiVerifyIds: new Set(["fresh-doc"]),
    });
    expect(result).toEqual({ ok: true, files: [doc] });
  });

  it("deja pasar videos sin consultar OpenAI", async () => {
    const result = await applyOpenAiAttachmentPolicy(openai, [vid], "strict");
    expect(result).toEqual({ ok: true, files: [vid] });
    expect(keepAvailableFiles).not.toHaveBeenCalled();
  });

  it("en modo strict falla si falta algún adjunto respaldado por OpenAI", async () => {
    vi.mocked(keepAvailableFiles).mockResolvedValueOnce([doc]);
    const result = await applyOpenAiAttachmentPolicy(
      openai,
      [doc, { ...doc, openai_file_id: "doc-2" }],
      "strict"
    );
    expect(result).toEqual({ ok: false, error: OPENAI_ATTACHMENT_UNAVAILABLE_ERROR });
  });

  it("en modo filter_unavailable omite adjuntos perdidos pero conserva videos", async () => {
    vi.mocked(keepAvailableFiles).mockResolvedValueOnce([doc]);
    const missing: IncomingFile = { openai_file_id: "doc-gone", type: "document", name: "x.pdf" };
    const result = await applyOpenAiAttachmentPolicy(openai, [doc, missing, vid], "filter_unavailable");
    expect(result).toEqual({ ok: true, files: [doc, vid] });
  });
});

describe("loadOwnedIncomingFiles", () => {
  it("devuelve not_owned cuando falta algún id", async () => {
    const { loadOwnedIncomingFiles } = await import("./chat-request");
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [{ openai_file_id: "a", mime: "image/png", name: null, video_description: null }],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await loadOwnedIncomingFiles(client, "user-1", ["a", "b"]);
    expect(result).toEqual({ ok: false, error: { kind: "not_owned" } });
  });
});
