import { describe, expect, it } from "vitest";
import {
  DEFAULT_INACTIVE_MONTHS,
  ageBucket,
  aggregateFiles,
  classifyMembers,
  fileKind,
  lastActivityByUser,
} from "../../scripts/lib/storage-report.mjs";

const AHORA = new Date("2026-09-19T00:00:00Z").getTime();
const DIA = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(AHORA - dias * DIA).toISOString();

describe("fileKind / ageBucket", () => {
  it("clasifica por MIME, no por extensión", () => {
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("application/pdf")).toBe("document");
    expect(fileKind(null)).toBe("document");
  });

  it("parte la edad en cubos de informe", () => {
    expect(ageBucket(hace(3), AHORA)).toBe("0-7d");
    expect(ageBucket(hace(20), AHORA)).toBe("7-30d");
    expect(ageBucket(hace(60), AHORA)).toBe("30-90d");
    expect(ageBucket(hace(400), AHORA)).toBe(">1a");
    expect(ageBucket(null, AHORA)).toBe("sin_fecha");
  });
});

describe("aggregateFiles", () => {
  it("separa biblioteca de nunca enviados y agrupa por usuario", () => {
    const report = aggregateFiles(
      [
        { user_id: "u1", mime: "image/png", created_at: hace(2), attached_at: hace(2), bytes: 100 },
        { user_id: "u1", mime: "video/mp4", created_at: hace(40), attached_at: null, bytes: 200 },
        { user_id: "u2", mime: "application/pdf", created_at: hace(10), attached_at: hace(10), bytes: 50 },
      ],
      AHORA
    );
    expect(report.total).toBe(3);
    expect(report.attached).toBe(2);
    expect(report.unattached).toBe(1);
    expect(report.byKind).toEqual({ image: 1, video: 1, document: 1 });
    expect(report.topUsers[0]).toMatchObject({ user_id: "u1", count: 2, unattached: 1, knownBytes: 300 });
  });
});

describe("classifyMembers", () => {
  it("no inventa un login: usa whitelist Skool + profiles + actividad", () => {
    const last = lastActivityByUser([
      { user_id: "p-quiet", at: hace(200) },
      { user_id: "p-active", at: hace(3) },
    ]);
    const { revoked, neverEntered, quiet } = classifyMembers({
      members: [
        { email: "baja@x.com", is_active: false },
        { email: "nunca@x.com", is_active: true },
        { email: "quieto@x.com", is_active: true },
        { email: "activo@x.com", is_active: true },
      ],
      profiles: [
        { id: "p-quiet", email: "quieto@x.com" },
        { id: "p-active", email: "activo@x.com" },
      ],
      lastActivityMsByUserId: last,
      now: AHORA,
      inactiveMonths: 6,
    });
    expect(revoked.map((r) => r.email)).toEqual(["baja@x.com"]);
    expect(neverEntered.map((r) => r.email)).toEqual(["nunca@x.com"]);
    expect(quiet.map((r) => r.email)).toEqual(["quieto@x.com"]);
    expect(DEFAULT_INACTIVE_MONTHS).toBe(6);
  });

  it("un perfil reciente sin chats no es quieto: el alta cuenta como actividad", () => {
    const last = lastActivityByUser([{ user_id: "p-new", at: hace(10) }]);
    const { quiet } = classifyMembers({
      members: [{ email: "nuevo@x.com", is_active: true }],
      profiles: [{ id: "p-new", email: "nuevo@x.com" }],
      lastActivityMsByUserId: last,
      now: AHORA,
      inactiveMonths: 6,
    });
    expect(quiet).toEqual([]);
  });
});
