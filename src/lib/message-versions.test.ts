import { describe, expect, it } from "vitest";
import { collapseVersions } from "./message-versions";

type Row = { role: "user" | "assistant"; content: string; active?: boolean };
const user = (content: string): Row => ({ role: "user", content });
const answer = (content: string, active = true): Row => ({ role: "assistant", content, active });
const text = (row: Row) => row.content;

describe("collapseVersions", () => {
  it("deja un hilo sin regeneraciones igual, sin versiones", () => {
    const rows = [user("a"), answer("A"), user("b"), answer("B")];
    expect(collapseVersions(rows, text)).toEqual(rows);
  });

  it("muestra la versión activa y la lista completa en la última respuesta", () => {
    const out = collapseVersions([user("a"), answer("A1", false), answer("A2"), answer("A3", false)], text);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ content: "A2", versions: ["A1", "A2", "A3"], versionIndex: 1 });
  });

  it("en turnos viejos deja solo la activa, sin flechas", () => {
    const out = collapseVersions([user("a"), answer("A1"), answer("A2", false), user("b"), answer("B")], text);
    expect(out.map(text)).toEqual(["a", "A1", "b", "B"]);
    expect(out[1].versions).toBeUndefined();
  });

  it("si ninguna quedó activa (regeneración que falló antes de guardar) usa la última", () => {
    const out = collapseVersions([user("a"), answer("A1", false), answer("A2", false)], text);
    expect(out[1]).toMatchObject({ content: "A2", versionIndex: 1 });
  });

  it("filas viejas sin columna active cuentan como activas", () => {
    const legacy = [user("a"), { role: "assistant" as const, content: "A" }];
    expect(collapseVersions(legacy, text)).toEqual(legacy);
  });
});
