"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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

/** Fila del menú de cuenta (Admin, Música, pistas, Configuración, Salir).
 *  "!text": button{color:inherit} de legacy todavía pisa las utilities. */
export const accountRowClass =
  "flex w-full items-center gap-3 rounded-lg text-left !text-[#c4c4cc] hover:bg-[#ffffff08] hover:!text-white";

/** Trazo de los íconos de fila. "!stroke": legacy aún trae svg{stroke-width:1.5}. */
export const accountIconClass = "h-[18px] w-[18px] shrink-0 fill-none stroke-current";

const eqBarClass =
  "block w-0.5 rounded-[2px] bg-current motion-reduce:group-aria-pressed:animate-none group-aria-pressed:[background:linear-gradient(to_bottom,#ffbd16,#ff165e_45%,#ed0cda_72%,#7753ff)]";

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
        // font-size: lo fija text-size.ts (.account-menu>button).
        className={cn(accountRowClass, "min-h-11 [border:0] px-3 py-[11px] !leading-5")}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={cn(accountIconClass, "block basis-[18px] !stroke-[1.5] text-[#a4a4ae]")}
        >
          <path d="M9 17V6.5a1 1 0 0 1 .8-1L19 3.7v11.5M9 9l10-2" />
          <ellipse cx="6.5" cy="17.5" rx="2.5" ry="2.5" />
          <ellipse cx="16.5" cy="15.5" rx="2.5" ry="2.5" />
        </svg>
        Música
        <span className="flex h-5 w-[18px] items-center justify-center" style={{ marginLeft: "auto" }}>
          {/* El submenú abre a la derecha: el chevrón queda en -90° abierto o cerrado. */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 fill-none stroke-current !stroke-[1.5] [transform:rotate(-90deg)]"
          >
            <path d="m8 10 4 4 4-4" />
          </svg>
        </span>
      </button>
      {/* left/top los pone place(); [hidden] lo resuelve el preflight. */}
      <div
        ref={panelRef}
        className={cn(
          "music-options absolute w-[180px] max-w-[calc(100vw_-_16px)] max-h-[min(360px,calc(100dvh_-_16px))] overflow-x-hidden overflow-y-auto",
          "rounded-xl border border-[#ffffff16] bg-[#111113] p-1.5 [box-shadow:0_12px_35px_#0005]",
          "animate-[music-open_.2s_ease-out] motion-reduce:animate-none max-[500px]:w-[145px]"
        )}
        hidden={!open}
      >
        {tracks.map((track, index) => (
          <button
            key={track.path}
            type="button"
            data-music={index}
            aria-pressed={playingIndex === index}
            onClick={() => toggleTrack(index)}
            className={cn(
              accountRowClass,
              "group [border:0] px-3 py-[11px]",
              "aria-pressed:!text-[#f1f1f4] aria-pressed:[background:linear-gradient(110deg,#ff682f12,#ff165e12,#7753ff1c)]"
            )}
          >
            <span className="music-equalizer flex h-[18px] w-[17px] shrink-0 items-center justify-center gap-[3px]" aria-hidden>
              <i className={cn(eqBarClass, "h-[7px] group-aria-pressed:animate-[equalizer_.8s_ease-in-out_infinite_alternate]")} />
              <i className={cn(eqBarClass, "h-[13px] group-aria-pressed:animate-[equalizer_.8s_ease-in-out_-.35s_infinite_alternate]")} />
              <i className={cn(eqBarClass, "h-[9px] group-aria-pressed:animate-[equalizer_.8s_ease-in-out_-.6s_infinite_alternate]")} />
            </span>
            <span>{track.label}</span>
          </button>
        ))}
        <label className="music-volume mt-[5px] flex flex-col gap-2.5 border-t border-t-[#ffffff0d] px-3 pt-[13px] pb-2.5 text-[10px] text-[#8d8d97]">
          <span>Volumen</span>
          {/* Thumb: sidebar-menus.css */}
          <input
            className="m-0 h-[3px] w-full cursor-pointer appearance-none rounded-[3px] accent-[#d777a5] bg-[linear-gradient(to_right,#b7b7c0_0%,#b7b7c0_var(--volume-fill,40%),#ffffff15_var(--volume-fill,40%),#ffffff15_100%)]"
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
