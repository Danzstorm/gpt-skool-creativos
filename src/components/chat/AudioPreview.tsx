"use client";

import { useEffect, useRef, useState } from "react";

const WAVE_BARS = [8, 15, 24, 13, 30, 20, 11, 25, 17];

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
      className={`audio-preview${playing ? " is-playing" : ""}`}
      title={failed ? "No se pudo reproducir este audio" : name}
      aria-label={`Reproducir ${name}`}
      aria-pressed={playing}
      disabled={!src}
      onClick={toggle}
    >
      <span className="audio-preview-wave" aria-hidden>
        {WAVE_BARS.map((height, i) => (
          <i key={i} style={{ height: `${height}px`, animationDelay: `${i * -0.11}s` }} />
        ))}
      </span>
      {src ? <audio ref={audioRef} src={src} preload="none" /> : null}
    </button>
  );
}
