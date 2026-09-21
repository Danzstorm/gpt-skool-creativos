"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AudioLines, ChevronRight, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const VOLUME_KEY = "creativos-music-volume";
const DEFAULT_VOLUME = 0.4;
const MUSIC_BUCKET = "music";
const FLYOUT_GAP = 8;

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

const noSubscribe = () => () => {};

// Música ambiente opcional del menú de cuenta. Submenú aparte a la derecha
// (no expansión inline), portaleado al body para no recortarse con el panel
// del menú de cuenta. Un solo <audio>, loop, sin autoplay.
export default function MusicMenu() {
  const [open, setOpen] = useState(false);
  // Capturado en el click, no leído de un ref durante el render (react-hooks/refs).
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // "Ya monté" por useSyncExternalStore, no por setState en un effect (mismo
  // motivo que MentionPreview): evita el lint react-hooks/set-state-in-effect.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

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

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

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

  const flyout =
    mounted && open && anchor
      ? createPortal(
          <div
            className="music-flyout frost fixed z-50 w-52 rounded-xl border border-zinc-800 p-1.5"
            style={{ top: anchor.top, left: anchor.right + FLYOUT_GAP }}
          >
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
                {playingIndex === i ? (
                  <span className="flex items-end gap-[2px] h-3.5 w-3.5" aria-hidden>
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className="w-[2px] bg-brand rounded-full motion-safe:animate-[music-eq_0.8s_ease-in-out_infinite_alternate]"
                        style={{ height: "100%", animationDelay: `${bar * 0.15}s` }}
                      />
                    ))}
                  </span>
                ) : (
                  <AudioLines size={14} />
                )}
                {track.label}
              </button>
            ))}
            <div className="px-2 pt-1.5 pb-1">
              <div className="mb-1 text-[11px] text-zinc-500">Volumen</div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="w-full accent-brand"
                aria-label="Volumen"
              />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          setAnchor(e.currentTarget.getBoundingClientRect());
          setOpen((v) => !v);
        }}
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
        <ChevronRight size={13} />
      </button>
      {flyout}
    </>
  );
}
