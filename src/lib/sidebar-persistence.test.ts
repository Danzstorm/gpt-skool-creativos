import { describe, expect, it } from "vitest";
import {
  ensureOpenProjectId,
  isSidebarCollapsedValue,
  parseOpenProjectIds,
  parseSidebarWidth,
  clampSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  sidebarCollapsedStorageValue,
  toggleOpenProjectId,
} from "./sidebar-persistence";

describe("isSidebarCollapsedValue", () => {
  it("solo trata '1' como colapsado, para no romper lo ya persistido", () => {
    expect(isSidebarCollapsedValue("1")).toBe(true);
    expect(isSidebarCollapsedValue("0")).toBe(false);
    expect(isSidebarCollapsedValue(null)).toBe(false);
    // Un boolean stringeado no es el contrato: el sidebar siempre escribió "1"/"0".
    expect(isSidebarCollapsedValue("true")).toBe(false);
  });
});

describe("sidebarCollapsedStorageValue", () => {
  it("escribe exactamente los dos valores que el efecto de montaje sabe leer", () => {
    expect(sidebarCollapsedStorageValue(true)).toBe("1");
    expect(sidebarCollapsedStorageValue(false)).toBe("0");
  });
});

describe("parseOpenProjectIds", () => {
  it("devuelve los ids string y descarta basura del array", () => {
    expect(parseOpenProjectIds('["p1","p2"]')).toEqual(["p1", "p2"]);
    expect(parseOpenProjectIds('["p1",1,null,"p2"]')).toEqual(["p1", "p2"]);
  });

  it("ante JSON corrupto o un valor que no es array, arranca plegado", () => {
    expect(parseOpenProjectIds(null)).toEqual([]);
    expect(parseOpenProjectIds("")).toEqual([]);
    expect(parseOpenProjectIds("{no json")).toEqual([]);
    expect(parseOpenProjectIds("{}")).toEqual([]);
    expect(parseOpenProjectIds("null")).toEqual([]);
  });
});

describe("toggleOpenProjectId", () => {
  it("abre si estaba cerrada y cierra si estaba abierta, sin mutar el original", () => {
    const closed = ["p1"];
    expect(toggleOpenProjectId(closed, "p2")).toEqual(["p1", "p2"]);
    expect(closed).toEqual(["p1"]);
    expect(toggleOpenProjectId(["p1", "p2"], "p1")).toEqual(["p2"]);
  });
});

describe("ensureOpenProjectId", () => {
  it("no duplica ni reescribe cuando la carpeta ya está abierta", () => {
    const open = ["p1", "p2"];
    expect(ensureOpenProjectId(open, "p2")).toBe(open);
    expect(ensureOpenProjectId(open, "p3")).toEqual(["p1", "p2", "p3"]);
  });
});

describe("clampSidebarWidth", () => {
  it("respeta 230–min(420, 45vw) como Martin", () => {
    expect(clampSidebarWidth(100, 1400)).toBe(230);
    expect(clampSidebarWidth(500, 1400)).toBe(420);
    expect(clampSidebarWidth(300, 600)).toBe(270);
  });
});

describe("parseSidebarWidth", () => {
  it("lee un número positivo o descarta", () => {
    expect(parseSidebarWidth("230")).toBe(230);
    expect(parseSidebarWidth("0")).toBeNull();
    expect(parseSidebarWidth(null)).toBeNull();
  });
});

describe("SIDEBAR_WIDTH_DEFAULT", () => {
  it("arranca en 230px como el prototipo", () => {
    expect(SIDEBAR_WIDTH_DEFAULT).toBe(230);
  });
});
