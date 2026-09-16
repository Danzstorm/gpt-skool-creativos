import { describe, expect, it } from "vitest";
import type { Project, ThreadSummary } from "./types";
import {
  assignThreadProject,
  assignThreadsToProject,
  bumpThreadAfterSend,
  chatListUrl,
  prependThread,
  removeThread,
  renameProjectInList,
  renameThreadInList,
  unassignProjectThreads,
} from "./thread-workspace";

const thread = (
  id: string,
  extra: Partial<ThreadSummary> = {}
): ThreadSummary => ({
  id,
  title: extra.title ?? "Nueva conversación",
  gpt_id: extra.gpt_id ?? "gpt-1",
  project_id: extra.project_id ?? null,
  created_at: extra.created_at ?? "2026-01-01T00:00:00.000Z",
  updated_at: extra.updated_at ?? "2026-01-01T00:00:00.000Z",
  last_message_preview: extra.last_message_preview,
});

const project = (id: string, name: string): Project => ({
  id,
  name,
  instructions: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

describe("assignThreadProject", () => {
  it("mueve y hace rollback con la misma función", () => {
    const list = [thread("a"), thread("b", { project_id: "p1" })];
    const moved = assignThreadProject(list, "a", "p1");
    expect(moved.find((t) => t.id === "a")?.project_id).toBe("p1");
    expect(assignThreadProject(moved, "a", null).find((t) => t.id === "a")?.project_id).toBe(null);
  });
});

describe("assignThreadsToProject", () => {
  it("asigna el lote que devolvió el servidor", () => {
    const list = [thread("a"), thread("b"), thread("c")];
    const next = assignThreadsToProject(list, ["a", "c"], "nuevo");
    expect(next.map((t) => t.project_id)).toEqual(["nuevo", null, "nuevo"]);
  });
});

describe("unassignProjectThreads", () => {
  it("suelta los chats de una carpeta borrada", () => {
    const list = [thread("a", { project_id: "p1" }), thread("b", { project_id: "p2" })];
    expect(unassignProjectThreads(list, "p1").map((t) => t.project_id)).toEqual([null, "p2"]);
  });
});

describe("renameThreadInList / renameProjectInList", () => {
  it("renombra sin tocar el resto", () => {
    expect(renameThreadInList([thread("a"), thread("b")], "a", "Brief")[0].title).toBe("Brief");
    expect(renameProjectInList([project("p", "Viejo")], "p", "Nuevo")[0].name).toBe("Nuevo");
  });
});

describe("prependThread / removeThread", () => {
  it("inserta al tope y borra por id", () => {
    const list = [thread("a")];
    const next = prependThread(list, thread("b"));
    expect(next.map((t) => t.id)).toEqual(["b", "a"]);
    expect(removeThread(next, "b").map((t) => t.id)).toEqual(["a"]);
  });
});

describe("bumpThreadAfterSend", () => {
  it("pone título, preview y sube el hilo al tope", () => {
    const list = [thread("a"), thread("b", { title: "Nueva conversación" })];
    const next = bumpThreadAfterSend(list, "b", "Hola mundo desde el brief", "2026-02-01T00:00:00.000Z");
    expect(next[0].id).toBe("b");
    expect(next[0].title).toBe("Hola mundo desde el brief".slice(0, 40));
    expect(next[0].last_message_preview).toBe("Hola mundo desde el brief".slice(0, 80));
    expect(next[0].updated_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("no pisa un título ya puesto", () => {
    const list = [thread("a", { title: "Logo" })];
    expect(bumpThreadAfterSend(list, "a", "otro mensaje")[0].title).toBe("Logo");
  });
});

describe("chatListUrl", () => {
  it("compone la ruta del historial", () => {
    expect(chatListUrl("")).toBe("/chat");
    expect(chatListUrl("?c=abc")).toBe("/chat?c=abc");
  });
});
