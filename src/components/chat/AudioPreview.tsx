"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const WAVE_BARS = [8, 15, 24, 13, 30, 20, 11, 25, 17];

/** Miniatura de adjunto de 64px (composer y mensajes), valores de Martin. */
export const attachTileClass =
  "attach-tile relative h-16 w-16 min-w-16 overflow-hidden rounded-xl [&_img]:block [&_video]:block";

/**
 * Onda genérica del prototipo: no es el waveform del archivo.
 * Play/pause al pulsar; solo un audio a la vez.
 */
export default function AudioPreview({
  src,
  name,
}: {
  src?: string;
  name: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    document.querySelectorAll<HTMLAudioElement>(".audio-preview audio").forEach((other) => {
      if (other !== audio) other.pause();
    });
    try {
      await audio.play();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      className={cn(
        "audio-preview relative grid h-16 w-16 place-items-center rounded-xl bg-[#202024] p-0",
        // `!`: button{color:inherit} de legacy.
        playing ? "is-playing !text-[#eeeef2]" : "!text-[#b6b6bd]"
      )}
      title={failed ? "No se pudo reproducir este audio" : name}
      aria-label={`Reproducir ${name}`}
      aria-pressed={playing}
      disabled={!src}
      onClick={toggle}
    >
      <span
        className="audio-preview-wave flex h-8 items-center gap-0.5 [&>i]:block [&>i]:w-0.5 [&>i]:origin-center [&>i]:rounded-sm [&>i]:bg-current"
        aria-hidden
      >
        {WAVE_BARS.map((height, i) => (
          <i key={i} style={{ height: `${height}px`, animationDelay: `${i * -0.11}s` }} />
        ))}
      </span>
      {src ? <audio ref={audioRef} src={src} preload="none" className="pointer-events-none absolute h-0 w-0 opacity-0" /> : null}
    </button>
  );
}
