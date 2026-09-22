const VOLUME_KEY = "creativos-music-volume";
export const DEFAULT_MUSIC_VOLUME = 0.4;
export const MUSIC_BUCKET = "music";
export const MUSIC_AUDIO_RE = /\.(mp3|m4a|wav|ogg|aac)$/i;
export const MUSIC_FLYOUT_GAP = 8;
export const MUSIC_FLYOUT_PAD = 8;

export const MUSIC_TRACK_PATHS = [
  { label: "Flow State", path: "flowstate.mp3" },
  { label: "Creative Fields", path: "creative-fields.mp3" },
  { label: "Brain Power", path: "brain-power.mp3" },
] as const;

export type MusicTrack = { label: string; path: string };

export function labelMusicTrack(
  path: string,
  known: readonly MusicTrack[] = MUSIC_TRACK_PATHS,
): string {
  const file = path.split("/").pop() ?? path;
  const hit = known.find((track) => track.path.toLowerCase() === file.toLowerCase());
  if (hit) return hit.label;
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Known labels first, then extra files from the `music` bucket. */
export function mergeMusicTracks(
  listed: Array<{ name: string }>,
  known: readonly MusicTrack[] = MUSIC_TRACK_PATHS,
): MusicTrack[] {
  const files = listed.filter((file) => MUSIC_AUDIO_RE.test(file.name));
  if (!files.length) return known.map((track) => ({ label: track.label, path: track.path }));

  const remaining = new Map(files.map((file) => [file.name.toLowerCase(), file.name]));
  const tracks: MusicTrack[] = [];
  for (const knownTrack of known) {
    const name = remaining.get(knownTrack.path.toLowerCase());
    if (!name) continue;
    tracks.push({ label: knownTrack.label, path: name });
    remaining.delete(knownTrack.path.toLowerCase());
  }
  for (const file of files) {
    if (!remaining.has(file.name.toLowerCase())) continue;
    tracks.push({ label: labelMusicTrack(file.name, known), path: file.name });
  }
  return tracks;
}

export type MusicPanelBox = { left: number; top: number; width: number; height: number };
export type MusicPanelPlacement = {
  left: number;
  top: number;
  placement: "right" | "below" | "above";
};

/**
 * Segundo panel de Martin: `left: calc(100% + 8px); top: 8px` relativo
 * al account-menu. Si no cabe a la derecha (viewport ~390), va debajo
 * o arriba y se clampa al viewport — mismo clamp que `positionChatMenu`.
 */
export function musicPanelPlacement(
  account: MusicPanelBox,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = MUSIC_FLYOUT_GAP,
  pad = MUSIC_FLYOUT_PAD,
): MusicPanelPlacement {
  const rightLeft = account.width + gap;
  if (account.left + rightLeft + panel.width <= viewport.width - pad) {
    return { left: rightLeft, top: 8, placement: "right" };
  }

  const left = Math.max(
    pad - account.left,
    Math.min(0, viewport.width - pad - panel.width - account.left),
  );
  const belowTop = account.height + gap;
  if (account.top + belowTop + panel.height <= viewport.height - pad) {
    return { left, top: belowTop, placement: "below" };
  }
  return { left, top: -panel.height - gap, placement: "above" };
}

/** `positionAccountMenu` de Martin: ancho ≥ 210, anclado al profile, 10px arriba. */
export function positionAccountMenuBox(
  profile: { left: number; top: number; width: number },
  menuHeight: number,
  pad = MUSIC_FLYOUT_PAD,
): { left: number; top: number; width: number } {
  return {
    width: Math.max(210, profile.width),
    left: profile.left,
    top: Math.max(pad, profile.top - menuHeight - 10),
  };
}

let audio: HTMLAudioElement | null = null;

export function getAmbientAudio(): HTMLAudioElement {
  if (typeof window === "undefined") {
    throw new Error("audio solo en el cliente");
  }
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    const saved = Number(localStorage.getItem(VOLUME_KEY));
    audio.volume =
      Number.isFinite(saved) && saved > 0 ? Math.min(1, saved) : DEFAULT_MUSIC_VOLUME;
  }
  return audio;
}

export function persistMusicVolume(value: number) {
  localStorage.setItem(VOLUME_KEY, String(value));
}

export function readMusicVolume(): number {
  if (typeof window === "undefined") return DEFAULT_MUSIC_VOLUME;
  const saved = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(saved) && saved > 0 ? Math.min(1, saved) : DEFAULT_MUSIC_VOLUME;
}

/** Al salir: parar y vaciar src. Un solo reproductor de sesión. */
export function stopAmbientMusic() {
  if (!audio) return;
  audio.pause();
  audio.src = "";
}
