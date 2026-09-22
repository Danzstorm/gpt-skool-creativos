"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_MUSIC_VOLUME,
  getAmbientAudio,
  MUSIC_BUCKET,
  MUSIC_TRACK_PATHS,
  persistMusicVolume,
  readMusicVolume,
} from "@/lib/ambient-music";

const FLYOUT_GAP = 8;
const noSubscribe = () => () => {};

const TRACKS = MUSIC_TRACK_PATHS.map((track) => ({
  label: track.label,
  src: createClient().storage.from(MUSIC_BUCKET).getPublicUrl(track.path).data.publicUrl,
}));

export default function MusicMenu() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [volume, setVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  useEffect(() => {
    const audio = getAmbientAudio();
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setVolume(readMusicVolume());
    audio.volume = readMusicVolume();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function changeVolume(value: number) {
    setVolume(value);
    getAmbientAudio().volume = value;
    persistMusicVolume(value);
  }

  async function toggleTrack(index: number) {
    const audio = getAmbientAudio();
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

  useEffect(() => {
    if (!open || !anchor || !flyoutRef.current) return;
    const menu = flyoutRef.current;
    const left = Math.max(
      8,
      Math.min(anchor.right + FLYOUT_GAP, window.innerWidth - menu.offsetWidth - 8)
    );
    const top = Math.max(
      8,
      Math.min(anchor.top, window.innerHeight - menu.offsetHeight - 8)
    );
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [open, anchor]);

  const flyout =
    mounted && open && anchor
      ? createPortal(
          <div
            ref={flyoutRef}
            className="music-options music-flyout"
            style={{ position: "fixed", top: anchor.top, left: anchor.right + FLYOUT_GAP, zIndex: 90 }}
          >
            {TRACKS.map((track, i) => (
              <button
                key={track.src}
                type="button"
                onClick={() => toggleTrack(i)}
                aria-pressed={playingIndex === i}
              >
                {playingIndex === i ? (
                  <span className="flex items-end gap-[2px] h-3.5 w-3.5" aria-hidden>
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className="w-[2px] rounded-full motion-safe:animate-[music-eq_0.8s_ease-in-out_infinite_alternate]"
                        style={{
                          height: "100%",
                          animationDelay: `${bar * 0.15}s`,
                          background: bar === 0 ? "#ffbd16" : bar === 1 ? "#ff165e" : "#7753ff",
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  <span aria-hidden />
                )}
                {track.label}
              </button>
            ))}
            <div className="px-2 pt-1.5 pb-1">
              <div className="mb-1 text-[11px]" style={{ color: "#777780" }}>
                Volumen
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
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
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 18V6l12-2v12" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <span>Música</span>
        {playingIndex != null && (
          <span className="flex items-end gap-[2px] h-3 ml-auto" aria-hidden>
            {[0, 1, 2].map((bar) => (
              <span
                key={bar}
                className="w-[2px] rounded-full motion-safe:animate-[music-eq_0.8s_ease-in-out_infinite_alternate]"
                style={{
                  height: "100%",
                  animationDelay: `${bar * 0.15}s`,
                  background: bar === 0 ? "#ffbd16" : bar === 1 ? "#ff165e" : "#7753ff",
                }}
              />
            ))}
          </span>
        )}
      </button>
      {flyout}
    </>
  );
}
