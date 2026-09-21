import { describe, expect, it } from "vitest";
import { parsePinnedThreadIds, sortPinnedFirst, togglePinnedThreadId } from "./pinned-threads";

describe("parsePinnedThreadIds", () => {
  it("lee ids string y descarta basura", () => {
    expect(parsePinnedThreadIds('["a","b"]')).toEqual(["a", "b"]);
    expect(parsePinnedThreadIds('["a",1,null]')).toEqual(["a"]);
    expect(parsePinnedThreadIds("{no")).toEqual([]);
  });
});

describe("togglePinnedThreadId", () => {
  it("fija al frente y desfija sin mutar", () => {
    const ids = ["a"];
    expect(togglePinnedThreadId(ids, "b")).toEqual(["b", "a"]);
    expect(ids).toEqual(["a"]);
    expect(togglePinnedThreadId(["b", "a"], "b")).toEqual(["a"]);
  });
});

describe("sortPinnedFirst", () => {
  it("deja los fijados arriba en el orden de pin", () => {
    const items = [{ id: "c" }, { id: "a" }, { id: "b" }];
    expect(sortPinnedFirst(items, ["b", "a"]).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
