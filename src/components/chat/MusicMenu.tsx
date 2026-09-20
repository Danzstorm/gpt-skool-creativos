"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Music2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const VOLUME_KEY = "creativos-music-volume";
const DEFAULT_VOLUME = 0.4;
const MUSIC_BUCKET = "music";

// Pistas grandes (loops ambient ~2h); viven en un bucket público de Supabase
// Storage en vez de /public para no inflar el repo, mismo patrón que gpt-icons.
const TRACK_PATHS = [
  { label: "Flow State", path: "flowstate.mp3" },
  { label: "Creative Fields", path: "creative-fields.mp3" },
  { label: "Brain Power", path: "brain-power.mp3" },
] as const;

const TRACKS = TRACK_PATHS.map((track) => ({
  label: track.label,
  src: createClient().storage.from(MUSIC_BUCKET).getPublicUrl(track.path).data.publicUrl,
}));

// Música ambiente opcional del menú de cuenta. Un solo <audio>, loop, sin
// autoplay — arranca solo por click. No persiste qué pista sonaba: al volver
// a entrar no debe empezar a sonar sola.
export default function MusicMenu() {
  const [open, setOpen] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    const saved = Number(localStorage.getItem(VOLUME_KEY));
    const startVolume = Number.isFinite(saved) && saved > 0 ? Math.min(1, saved) : DEFAULT_VOLUME;
    audio.volume = startVolume;
    // Post-hidratación a propósito, igual que el resto de la persistencia del
    // sidebar: leer localStorage en el render inicial desfasaría el HTML del servidor.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setVolume(startVolume);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  function changeVolume(value: number) {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
    localStorage.setItem(VOLUME_KEY, String(value));
  }

  async function toggleTrack(index: number) {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingIndex === index) {
      audio.pause();
      setPlayingIndex(null);
      return;
    }

    audio.pause();
    audio.src = TRACKS[index].src;
    try {
      await audio.play();
      setPlayingIndex(index);
    } catch {
      setPlayingIndex(null);
    }
  }

  return (
    <div className="border-t border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.06] hover:text-ink transition"
      >
        <Music2 size={15} />
        <span className="flex-1 text-left">Música</span>
        {playingIndex != null && (
          <span className="flex items-end gap-[2px] h-3" aria-hidden>
            {[0, 1, 2].map((bar) => (
              <span
                key={bar}
                className="w-[2px] bg-brand rounded-full motion-safe:animate-[music-eq_0.8s_ease-in-out_infinite_alternate]"
                style={{ height: "100%", animationDelay: `${bar * 0.15}s` }}
              />
            ))}
          </span>
        )}
        <ChevronRight size={13} className={cn("text-zinc-500 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="px-3 pb-2.5 space-y-1">
          {TRACKS.map((track, i) => (
            <button
              key={track.src}
              type="button"
              onClick={() => toggleTrack(i)}
              aria-pressed={playingIndex === i}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-left transition",
                playingIndex === i ? "text-ink bg-brand/15" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
              )}
            >
              {playingIndex === i ? <Pause size={12} /> : <Play size={12} />}
              {track.label}
            </button>
          ))}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="mt-1 w-full accent-brand"
            aria-label="Volumen"
          />
        </div>
      )}
    </div>
  );
}
