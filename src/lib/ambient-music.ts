const VOLUME_KEY = "creativos-music-volume";
export const DEFAULT_MUSIC_VOLUME = 0.4;
export const MUSIC_BUCKET = "music";

export const MUSIC_TRACK_PATHS = [
  { label: "Flow State", path: "flowstate.mp3" },
  { label: "Creative Fields", path: "creative-fields.mp3" },
  { label: "Brain Power", path: "brain-power.mp3" },
] as const;

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
