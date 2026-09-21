import { describe, expect, it } from "vitest";
import type { UploadedFile } from "./types";
import { MAX_FILES_PER_MESSAGE } from "./upload-file";
import { MAX_SIZE_BYTES, MAX_SIZE_MB, MAX_VIDEO_SIZE_BYTES, MAX_VIDEO_SIZE_MB } from "./upload-limits";
import {
  applyUploadToTray,
  attachmentPreviewBlob,
  commitUploadResults,
  composeUploadError,
  decideLibraryAttach,
  fileSizeRejectReason,
  maxFilesMessage,
  namedUploadError,
  planUploadBatch,
  skippedFilesMessage,
  toChatRequestFile,
} from "./chat-uploads";

const img = { type: "image/png", size: 10, name: "a.png" };
const vid = { type: "video/mp4", size: 10, name: "b.mp4" };
const doc = { type: "application/pdf", size: 10, name: "c.pdf" };

const libraryFile = {
  name: "brief.pdf",
  openai_file_id: "file-1",
  type: "document" as const,
};

describe("planUploadBatch", () => {
  it("deja entrar otra tanda y reserva el cupo de las subidas en vuelo", () => {
    expect(
      planUploadBatch({
        files: [img, img, img],
        attachedCount: 2,
        pendingUploads: 3,
      })
    ).toEqual({
      ok: true,
      batch: [img, img, img],
      skippedCount: 0,
      uploadingVideo: false,
    });
  });

  it("rechaza si adjuntos más subidas en vuelo ya ocupan el tope", () => {
    expect(
      planUploadBatch({
        files: [img],
        attachedCount: MAX_FILES_PER_MESSAGE - 2,
        pendingUploads: 2,
      })
    ).toEqual({ ok: false, error: maxFilesMessage() });
  });

  it("recorta al cupo que queda después de reservar las subidas en vuelo", () => {
    expect(
      planUploadBatch({
        files: [img, img, img],
        attachedCount: MAX_FILES_PER_MESSAGE - 3,
        pendingUploads: 2,
      })
    ).toEqual({
      ok: true,
      batch: [img],
      skippedCount: 2,
      uploadingVideo: false,
    });
  });

  it("rechaza cuando el mensaje ya tiene el máximo de adjuntos", () => {
    expect(
      planUploadBatch({
        files: [img],
        attachedCount: MAX_FILES_PER_MESSAGE,
        pendingUploads: 0,
      })
    ).toEqual({ ok: false, error: maxFilesMessage() });
  });

  it("recorta al cupo restante y cuenta los omitidos", () => {
    const files = [img, img, img, doc];
    expect(
      planUploadBatch({
        files,
        attachedCount: MAX_FILES_PER_MESSAGE - 2,
        pendingUploads: 0,
      })
    ).toEqual({
      ok: true,
      batch: [img, img],
      skippedCount: 2,
      uploadingVideo: false,
    });
  });

  it("marca video si alguno de los que sí entran es video", () => {
    const plan = planUploadBatch({
      files: [img, vid],
      attachedCount: 0,
      pendingUploads: 0,
    });
    expect(plan).toMatchObject({ ok: true, uploadingVideo: true, skippedCount: 0 });
  });

  it("no marca video si el video quedó fuera del cupo", () => {
    const plan = planUploadBatch({
      files: [img, vid],
      attachedCount: MAX_FILES_PER_MESSAGE - 1,
      pendingUploads: 0,
    });
    expect(plan).toEqual({
      ok: true,
      batch: [img],
      skippedCount: 1,
      uploadingVideo: false,
    });
  });
});

describe("fileSizeRejectReason", () => {
  it("deja pasar imagen y video en el tope exacto", () => {
    expect(fileSizeRejectReason({ type: "image/png", size: MAX_SIZE_BYTES })).toBeNull();
    expect(fileSizeRejectReason({ type: "video/mp4", size: MAX_VIDEO_SIZE_BYTES })).toBeNull();
  });

  it("usa el tope de video, no el de imagen, para un mp4", () => {
    expect(
      fileSizeRejectReason({ type: "video/mp4", size: MAX_SIZE_BYTES + 1 })
    ).toBeNull();
    expect(
      fileSizeRejectReason({ type: "video/mp4", size: MAX_VIDEO_SIZE_BYTES + 1 })
    ).toBe(`supera el límite de ${MAX_VIDEO_SIZE_MB}MB`);
  });

  it("rechaza una imagen por encima del tope de 25MB", () => {
    expect(
      fileSizeRejectReason({ type: "image/jpeg", size: MAX_SIZE_BYTES + 1 })
    ).toBe(`supera el límite de ${MAX_SIZE_MB}MB`);
  });
});

describe("decideLibraryAttach", () => {
  it("ignora un archivo que ya está adjunto, sin error", () => {
    const current = [{ ...libraryFile }];
    expect(decideLibraryAttach(current, libraryFile)).toEqual({ next: current });
  });

  it("respeta el tope antes de que el composer vacíe los adjuntos", () => {
    const current = Array.from({ length: MAX_FILES_PER_MESSAGE }, (_, i) => ({
      name: `f${i}`,
      openai_file_id: `file-${i}`,
      type: "document" as const,
    }));
    const extra = { name: "otro.pdf", openai_file_id: "file-nuevo", type: "document" as const };
    expect(decideLibraryAttach(current, extra)).toEqual({
      next: current,
      error: maxFilesMessage(),
    });
  });

  it("agrega el archivo reusando el file_id, sin subir de nuevo", () => {
    expect(decideLibraryAttach([], { ...libraryFile, previewUrl: "/p" })).toEqual({
      next: [{ ...libraryFile, previewUrl: "/p" }],
    });
  });
});

describe("composeUploadError", () => {
  it("junta omitidos y fallos de archivo con el mismo separador de la UI", () => {
    expect(
      composeUploadError([
        skippedFilesMessage(2),
        namedUploadError("foto.png", "supera el límite de 25MB"),
      ])
    ).toBe(
      "Se omitieron 2 archivos: máximo 10 por mensaje. · foto.png: supera el límite de 25MB"
    );
  });

  it("no inventa un aviso cuando todo salió bien", () => {
    expect(composeUploadError([])).toBeNull();
  });
});

describe("attachmentPreviewBlob", () => {
  it("hereda el MIME del servidor cuando el blob llegó sin type", () => {
    const raw = new Blob([new Uint8Array([1, 2, 3])]);
    expect(raw.type).toBe("");
    const preview = attachmentPreviewBlob(raw, "image", "image/jpeg");
    expect(preview).not.toBe(raw);
    expect(preview.type).toBe("image/jpeg");
  });

  it("no reenvuelve un archivo que ya trae type, ni un documento", () => {
    const image = new Blob([new Uint8Array([1])], { type: "image/png" });
    const docBlob = new Blob([new Uint8Array([1])]);
    expect(attachmentPreviewBlob(image, "image", "image/jpeg")).toBe(image);
    expect(attachmentPreviewBlob(docBlob, "document", "application/pdf")).toBe(docBlob);
  });
});

function uploaded(id: string, name = `${id}.pdf`): UploadedFile {
  return { name, openai_file_id: id, type: "document" };
}

describe("commitUploadResults — arbitraje al cerrar una subida", () => {
  it("reproduce la carrera: biblioteca llena el cupo mientras el lote vuela", () => {
    // 8 ya adjuntos. El plan dejó entrar 2. Durante el await, la biblioteca
    // suma 2 y llega a 10. Concatenar `[...prev, ...ok]` daría 12.
    let current = Array.from({ length: 8 }, (_, i) => uploaded(`prev-${i}`));
    const fromLibrary = [uploaded("lib-a"), uploaded("lib-b")];
    for (const file of fromLibrary) {
      current = decideLibraryAttach(current, file).next;
    }
    expect(current).toHaveLength(MAX_FILES_PER_MESSAGE);

    const incoming = [uploaded("up-1"), uploaded("up-2")];
    const naive = [...current, ...incoming];
    expect(naive.length).toBeGreaterThan(MAX_FILES_PER_MESSAGE);

    const commit = commitUploadResults(current, incoming);
    expect(commit.next).toHaveLength(MAX_FILES_PER_MESSAGE);
    expect(commit.next).toEqual(current);
    expect(commit.next.map((f) => f.openai_file_id)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `prev-${i}`),
      "lib-a",
      "lib-b",
    ]);
    expect(commit.accepted).toEqual([]);
    expect(commit.overflow).toEqual(incoming);
    expect(commit.duplicates).toEqual([]);
  });

  it("acepta lo que cabe y descarta el resto, sin tocar lo ya adjunto", () => {
    const current = [
      ...Array.from({ length: 8 }, (_, i) => uploaded(`prev-${i}`)),
      uploaded("lib-a"),
    ];
    const incoming = [uploaded("up-1"), uploaded("up-2")];
    const commit = commitUploadResults(current, incoming);

    expect(commit.next).toHaveLength(MAX_FILES_PER_MESSAGE);
    expect(commit.next.map((f) => f.openai_file_id)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `prev-${i}`),
      "lib-a",
      "up-1",
    ]);
    expect(commit.accepted).toEqual([incoming[0]]);
    expect(commit.overflow).toEqual([incoming[1]]);
  });

  it("deduplica por file_id y no cuenta el duplicado como overflow", () => {
    const current = [uploaded("file-1"), uploaded("file-2")];
    const incoming = [uploaded("file-1", "otra-copia.pdf"), uploaded("file-3")];
    const commit = commitUploadResults(current, incoming);

    expect(commit.next.map((f) => f.openai_file_id)).toEqual(["file-1", "file-2", "file-3"]);
    expect(commit.duplicates).toEqual([incoming[0]]);
    expect(commit.overflow).toEqual([]);
  });

  it("fusiona el upload en el tile sin cambiar clientId ni el blob local", () => {
    const current: UploadedFile[] = [
      {
        clientId: "tile-1",
        name: "a.png",
        openai_file_id: "pending_tile-1",
        type: "image",
        previewUrl: "blob:keep",
        pending: true,
      },
    ];
    const next = applyUploadToTray(current, "tile-1", {
      name: "a.png",
      openai_file_id: "file-1",
      type: "image",
      previewUrl: "blob:new",
    });
    expect(next[0]).toMatchObject({
      clientId: "tile-1",
      openai_file_id: "file-1",
      previewUrl: "blob:keep",
      pending: false,
    });
  });

  it("no manda audio sintético ni tiles pendientes al chat", () => {
    expect(
      toChatRequestFile({
        name: "voz.mp3",
        openai_file_id: "audio_1",
        type: "audio",
      })
    ).toBeNull();
    expect(
      toChatRequestFile({
        name: "foto.png",
        openai_file_id: "pending_x",
        type: "image",
        pending: true,
      })
    ).toBeNull();
    expect(
      toChatRequestFile({
        name: "voz.mp3",
        openai_file_id: "file-abc",
        type: "audio",
      })
    ).toEqual({ openai_file_id: "file-abc", type: "document" });
  });

  it("deja pasar el lote entero cuando hay cupo", () => {
    const current = [uploaded("prev")];
    const incoming = [uploaded("up-1"), uploaded("up-2")];
    expect(commitUploadResults(current, incoming)).toEqual({
      next: [...current, ...incoming],
      accepted: incoming,
      overflow: [],
      duplicates: [],
    });
  });
});
