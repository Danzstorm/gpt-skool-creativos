import { describe, expect, it } from "vitest";
import { groupThreadsByProject } from "./project-grouping";
import type { Project, ThreadSummary } from "./types";

const project = (id: string, name: string): Project => ({
  id,
  name,
  instructions: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const thread = (id: string, title: string, project_id: string | null, gpt_id = "g1"): ThreadSummary => ({
  id,
  title,
  gpt_id,
  project_id,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const gptNames = new Map([
  ["g1", "Copywriter"],
  ["g2", "Diseñador"],
]);

describe("groupThreadsByProject", () => {
  it("separa los chats de un proyecto de la lista suelta (no se duplican)", () => {
    const { groups, loose } = groupThreadsByProject(
      [thread("t1", "Campaña", "p1"), thread("t2", "Suelto", null)],
      [project("p1", "Marketing")],
      "",
      gptNames
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].threads.map((t) => t.id)).toEqual(["t1"]);
    expect(loose.map((t) => t.id)).toEqual(["t2"]);
  });

  it("muestra los proyectos vacíos y cerrados cuando no hay búsqueda", () => {
    const { groups } = groupThreadsByProject([], [project("p1", "Marketing")], "", gptNames);
    expect(groups[0].threads).toEqual([]);
    expect(groups[0].forceOpen).toBe(false);
  });

  it("al buscar abre el proyecto y deja solo los chats que matchean", () => {
    const { groups, loose } = groupThreadsByProject(
      [thread("t1", "Campaña de verano", "p1"), thread("t2", "Otra cosa", "p1"), thread("t3", "Campaña suelta", null)],
      [project("p1", "Marketing")],
      "campaña",
      gptNames
    );

    expect(groups[0].threads.map((t) => t.id)).toEqual(["t1"]);
    expect(groups[0].forceOpen).toBe(true);
    expect(loose.map((t) => t.id)).toEqual(["t3"]);
  });

  it("oculta los proyectos que no aportan nada a la búsqueda", () => {
    const { groups } = groupThreadsByProject(
      [thread("t1", "Otra cosa", "p1")],
      [project("p1", "Marketing"), project("p2", "Ventas")],
      "campaña",
      gptNames
    );
    expect(groups).toEqual([]);
  });

  it("si matchea el nombre del proyecto, muestra todos sus chats", () => {
    const { groups } = groupThreadsByProject(
      [thread("t1", "Otra cosa", "p1"), thread("t2", "Nada que ver", "p1")],
      [project("p1", "Marketing")],
      "marketing",
      gptNames
    );
    expect(groups[0].threads.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("busca también por nombre del GPT, dentro y fuera de proyectos", () => {
    const { groups, loose } = groupThreadsByProject(
      [thread("t1", "Algo", "p1", "g2"), thread("t2", "Algo más", null, "g2"), thread("t3", "Algo", null, "g1")],
      [project("p1", "Marketing")],
      "diseñador",
      gptNames
    );
    expect(groups[0].threads.map((t) => t.id)).toEqual(["t1"]);
    expect(loose.map((t) => t.id)).toEqual(["t2"]);
  });

  it("trata como suelto un chat cuyo proyecto ya no está en la lista", () => {
    const { groups, loose } = groupThreadsByProject(
      [thread("t1", "Huérfano", "borrado")],
      [project("p1", "Marketing")],
      "",
      gptNames
    );
    expect(groups[0].threads).toEqual([]);
    expect(loose.map((t) => t.id)).toEqual(["t1"]);
  });
});
