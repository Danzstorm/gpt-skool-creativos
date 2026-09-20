import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IncomingFile } from "./chat-content";
import { analyzeOwnedVideo, fillMissingVideoDescriptions } from "./video-analyze";

function readyVideoClient(description: string): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        openai_file_id: "video_1",
                        storage_path: "u/clip.mp4",
                        mime: "video/mp4",
                        name: "clip.mp4",
                        video_description: description,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("analyzeOwnedVideo", () => {
  it("no vuelve a gastar si ya hay descripción", async () => {
    const result = await analyzeOwnedVideo(readyVideoClient("ya está"), "user-1", "video_1");
    expect(result).toEqual({ ok: true, description: "ya está", alreadyReady: true });
  });
});

describe("fillMissingVideoDescriptions", () => {
  it("no toca archivos que ya tienen texto", async () => {
    const files: IncomingFile[] = [
      { openai_file_id: "video_1", type: "video", videoDescription: "escena" },
      { openai_file_id: "img-1", type: "image" },
    ];
    const result = await fillMissingVideoDescriptions(
      {} as SupabaseClient,
      "user-1",
      files
    );
    expect(result).toEqual({ ok: true, files });
  });

  it("rellena el video pendiente y no manda el prompt sin contexto", async () => {
    const files: IncomingFile[] = [
      { openai_file_id: "video_1", type: "video", videoDescription: null },
    ];
    const result = await fillMissingVideoDescriptions(
      readyVideoClient("transcripción lista"),
      "user-1",
      files
    );
    expect(result).toEqual({
      ok: true,
      files: [{ openai_file_id: "video_1", type: "video", videoDescription: "transcripción lista" }],
    });
  });
});
