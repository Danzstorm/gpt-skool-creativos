"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import EnergyCanvas from "@/components/ui/EnergyCanvas";
import { imageRevealWaitMs } from "@/lib/image-loading";
import { cn } from "@/lib/utils";

export type StillSource = {
  kind: "image" | "video" | "document";
  previewUrl?: string;
  mediaUrl?: string;
  durationSeconds?: number;
};

function isPlayableVideo(url: string) {
  return /^https?:/i.test(url) || /^blob:/i.test(url);
}

function ImageLoadingFrame({
  src,
  className,
  energy,
}: {
  src: string;
  className?: string;
  energy: boolean;
}) {
  const startedRef = useRef(0);
  const settledRef = useRef(!energy);
  const [ready, setReady] = useState(!energy);

  useEffect(() => {
    startedRef.current = performance.now();
  }, []);

  const finish = useCallback(async (img: HTMLImageElement) => {
    if (settledRef.current) return;
    try {
      if (img.decode) await img.decode();
    } catch {
      /* decode opcional: si falla igual revelamos tras el mínimo */
    }
    const wait = imageRevealWaitMs(startedRef.current);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (settledRef.current) return;
    settledRef.current = true;
    setReady(true);
  }, []);

  if (!energy) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={className} />
    );
  }

  return (
    <span className={cn("image-loading-frame", ready && "is-ready")} aria-busy={!ready}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={className}
        onLoad={(e) => {
          void finish(e.currentTarget);
        }}
        ref={(el) => {
          if (el?.complete) void finish(el);
        }}
      />
      <span className="image-loading-indicator" role="status" aria-label="Cargando imagen">
        <ImageEnergyOverlay active={!ready} />
      </span>
    </span>
  );
}

export default function AttachmentStill({
  file,
  className,
  iconSize = 22,
  showDuration = false,
  loop = false,
  energy = false,
}: {
  file: StillSource;
  className?: string;
  iconSize?: number;
  showDuration?: boolean;
  loop?: boolean;
  /** Secuencia de energía del prototipo: mínimo 2s + decode, revelado 280ms. */
  energy?: boolean;
}) {
  const [duration, setDuration] = useState(file.durationSeconds);
  const mediaClass = className ?? "h-full w-full object-cover";
  const videoSrc = file.kind === "video" ? file.mediaUrl || (file.previewUrl && isPlayableVideo(file.previewUrl) ? file.previewUrl : undefined) : undefined;

  let media: ReactNode;
  if (file.kind === "image" && file.previewUrl) {
    media = <ImageLoadingFrame src={file.previewUrl} className={mediaClass} energy={energy} />;
  } else if (videoSrc && (loop || /^https?:/i.test(videoSrc))) {
    media = (
      <video
        src={videoSrc}
        muted
        playsInline
        autoPlay={loop}
        loop={loop}
        preload="metadata"
        className={mediaClass}
        onLoadedMetadata={(e) => {
          const next = e.currentTarget.duration;
          if (Number.isFinite(next)) setDuration(next);
        }}
      />
    );
  } else if (file.kind === "video" && file.previewUrl) {
    media = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.previewUrl} alt="" className={mediaClass} />
    );
  } else {
    media = (
      <span className={`flex items-center justify-center bg-zinc-900 ${mediaClass}`}>
        <svg viewBox="0 0 24 24" aria-hidden width={iconSize} height={iconSize}>
          <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11A1.5 1.5 0 0 0 19 19.5V8Z" />
        </svg>
      </span>
    );
  }

  const badge =
    showDuration && file.kind === "video" && duration != null && Number.isFinite(duration);

  return (
    <span className="relative block h-full w-full">
      {media}
      {badge ? (
        <span className="absolute bottom-1 right-1 rounded-md bg-black/75 px-1 py-px text-[10px] font-medium leading-none text-white tabular-nums">
          {Math.floor(duration! / 60)}:{String(Math.floor(duration! % 60)).padStart(2, "0")}
        </span>
      ) : null}
    </span>
  );
}

export function ImageEnergyOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="image-loading-energy" aria-hidden>
      <EnergyCanvas size={64} speed={0.0045} />
    </span>
  );
}
