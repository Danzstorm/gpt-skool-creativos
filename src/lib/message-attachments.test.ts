import { describe, expect, it } from "vitest";
import { threadFileIds } from "./message-attachments";

describe("threadFileIds", () => {
  it("collects unique openai_file_id across messages", () => {
    const messages = [
      { files: [{ openai_file_id: "a" }, { openai_file_id: "b" }] },
      { files: [{ openai_file_id: "b" }] },
    ];
    expect(threadFileIds(messages)).toEqual(["a", "b"]);
  });

  it("ignores messages without files", () => {
    expect(threadFileIds([{ files: null }, { files: undefined }])).toEqual([]);
  });

  it("ignores malformed entries instead of throwing", () => {
    const messages = [{ files: [null, "not-an-object", { name: "no id here" }, { openai_file_id: 42 }] }];
    expect(threadFileIds(messages)).toEqual([]);
  });

  it("returns [] for an empty thread", () => {
    expect(threadFileIds([])).toEqual([]);
  });
});
