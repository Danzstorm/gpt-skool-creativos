import { describe, expect, it } from "vitest";
import {
  labelMusicTrack,
  mergeMusicTracks,
  musicPanelPlacement,
  MUSIC_TRACK_PATHS,
  positionAccountMenuBox,
} from "./ambient-music";

describe("mergeMusicTracks / labelMusicTrack", () => {
  it("si el bucket no lista, se queda con los paths conocidos", () => {
    expect(mergeMusicTracks([])).toEqual(
      MUSIC_TRACK_PATHS.map((track) => ({ label: track.label, path: track.path })),
    );
  });

  it("respeta las etiquetas de Martin y añade extras del bucket", () => {
    expect(
      mergeMusicTracks([
        { name: "readme.txt" },
        { name: "brain-power.mp3" },
        { name: "flowstate.mp3" },
        { name: "night-drive.mp3" },
        { name: "creative-fields.mp3" },
      ]),
    ).toEqual([
      { label: "Flow State", path: "flowstate.mp3" },
      { label: "Creative Fields", path: "creative-fields.mp3" },
      { label: "Brain Power", path: "brain-power.mp3" },
      { label: "Night Drive", path: "night-drive.mp3" },
    ]);
  });

  it("formatea un archivo extra sin mapa conocido", () => {
    expect(labelMusicTrack("deep_focus.wav")).toBe("Deep Focus");
    expect(labelMusicTrack("flowstate.mp3")).toBe("Flow State");
  });
});

describe("musicPanelPlacement / positionAccountMenuBox", () => {
  it("en desktop el segundo panel va a la derecha del account-menu", () => {
    expect(
      musicPanelPlacement(
        { left: 16, top: 420, width: 230, height: 200 },
        { width: 180, height: 220 },
        { width: 1280, height: 800 },
      ),
    ).toEqual({ left: 238, top: 8, placement: "right" });
  });

  it("en ~390px no se sale: si no cabe a la derecha, va debajo y clampa", () => {
    const next = musicPanelPlacement(
      { left: 20, top: 200, width: 230, height: 180 },
      { width: 180, height: 220 },
      { width: 390, height: 844 },
    );
    expect(next.placement).toBe("below");
    expect(next.left + 20 + 180).toBeLessThanOrEqual(390 - 8);
    expect(next.top).toBe(188);
  });

  it("si tampoco cabe debajo, sube el panel por encima", () => {
    expect(
      musicPanelPlacement(
        { left: 16, top: 620, width: 230, height: 200 },
        { width: 180, height: 220 },
        { width: 390, height: 844 },
      ).placement,
    ).toBe("above");
  });

  it("ancla el account-menu como positionAccountMenu de Martin", () => {
    expect(positionAccountMenuBox({ left: 24, top: 700, width: 198 }, 188)).toEqual({
      width: 210,
      left: 24,
      top: 502,
    });
  });
});
