"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_MUSIC_VOLUME,
  getAmbientAudio,
  labelMusicTrack,
  mergeMusicTracks,
  MUSIC_BUCKET,
  MUSIC_TRACK_PATHS,
  musicPanelPlacement,
  persistMusicVolume,
  readMusicVolume,
  type MusicTrack,
} from "@/lib/ambient-music";

type ListedTrack = MusicTrack & { src: string };

function fallbackTracks(): ListedTrack[] {
  const storage = createClient().storage.from(MUSIC_BUCKET);
  return MUSIC_TRACK_PATHS.map((track) => ({
    label: track.label,
    path: track.path,
    src: storage.getPublicUrl(track.path).data.publicUrl,
  }));
}

export default function MusicMenu() {
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState<ListedTrack[]>(fallbackTracks);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [volume, setVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = getAmbientAudio();
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setVolume(readMusicVolume());
    audio.volume = readMusicVolume();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const client = createClient();
    void client.storage
      .from(MUSIC_BUCKET)
      .list("", { limit: 100, sortBy: { column: "name", order: "asc" } })
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        const listed = mergeMusicTracks(data);
        if (!listed.length) return;
        setTracks(
          listed.map((track) => ({
            ...track,
            label: labelMusicTrack(track.path),
            src: client.storage.from(MUSIC_BUCKET).getPublicUrl(track.path).data.publicUrl,
          })),
        );
      })
      .catch(() => {
        /* el bucket público puede no listar; nos quedamos con los paths conocidos */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const account = panel?.closest(".account-menu");
    if (!open || !panel || !(account instanceof HTMLElement)) return;
    const menu = account;
    const flyout = panel;

    function place() {
      const next = musicPanelPlacement(
        menu.getBoundingClientRect(),
        { width: flyout.offsetWidth, height: flyout.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      );
      flyout.style.left = `${next.left}px`;
      flyout.style.top = `${next.top}px`;
      flyout.dataset.placement = next.placement;
    }

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, tracks.length]);

  function changeVolume(percent: number) {
    const value = Math.min(1, Math.max(0, percent / 100));
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
    audio.src = tracks[index].src;
    try {
      await audio.play();
      setPlayingIndex(index);
    } catch {
      setPlayingIndex(null);
    }
  }

  const volumePercent = Math.round(volume * 100);

  return (
    <>
      <button
        id="musicToggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 17V6.5a1 1 0 0 1 .8-1L19 3.7v11.5M9 9l10-2" />
          <ellipse cx="6.5" cy="17.5" rx="2.5" ry="2.5" />
          <ellipse cx="16.5" cy="15.5" rx="2.5" ry="2.5" />
        </svg>
        Música
        <span style={{ marginLeft: "auto" }}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="m8 10 4 4 4-4" />
          </svg>
        </span>
      </button>
      <div ref={panelRef} className="music-options" hidden={!open}>
        {tracks.map((track, index) => (
          <button
            key={track.path}
            type="button"
            data-music={index}
            aria-pressed={playingIndex === index}
            onClick={() => toggleTrack(index)}
          >
            <span className="music-equalizer" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span>{track.label}</span>
          </button>
        ))}
        <label className="music-volume">
          <span>Volumen</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            style={{ ["--volume-fill" as string]: `${volumePercent}%` }}
            onChange={(event) => changeVolume(Number(event.target.value))}
            aria-label="Volumen de música"
          />
        </label>
      </div>
    </>
  );
}
