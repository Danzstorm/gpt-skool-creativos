import { describe, expect, it } from "vitest";
import { apiAccessForPath } from "./api-access-policy";

describe("apiAccessForPath", () => {
  it("protege por defecto cualquier API existente o futura", () => {
    expect(apiAccessForPath("/api/chat")).toBe("authenticated");
    expect(apiAccessForPath("/api/admin/settings")).toBe("authenticated");
    expect(apiAccessForPath("/api/nueva-ruta")).toBe("authenticated");
  });

  it("permite cerrar y limpiar una sesión ya caducada, solo en la ruta exacta", () => {
    expect(apiAccessForPath("/api/auth/signout")).toBe("session-exempt");
    expect(apiAccessForPath("/api/auth/signout-extra")).toBe("authenticated");
    expect(apiAccessForPath("/api/auth/signout/otra")).toBe("authenticated");
  });

  it("ya no expone el chequeo de email previo al login (retirado con el magic link)", () => {
    expect(apiAccessForPath("/api/auth/check-email")).toBe("authenticated");
  });

  it("exime solo los webhooks existentes con autenticación propia", () => {
    expect(apiAccessForPath("/api/webhooks/skool")).toBe("session-exempt");
    expect(apiAccessForPath("/api/webhooks/skool/")).toBe("session-exempt");
    expect(apiAccessForPath("/api/webhooks/skool/bulk")).toBe("session-exempt");
    expect(apiAccessForPath("/api/webhooks/nuevo")).toBe("authenticated");
  });

  it("no aplica la política API a páginas ni callbacks de autenticación", () => {
    expect(apiAccessForPath("/login")).toBe("not-api");
    expect(apiAccessForPath("/auth/callback")).toBe("not-api");
  });
});
