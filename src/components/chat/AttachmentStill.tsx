"use client";

import { useState, type ReactNode } from "react";
import { Paperclip, Video } from "lucide-react";
import { formatVideoBadge } from "@/lib/video-copy";

export type StillSource = {
  kind: "image" | "video" | "document";
  previewUrl?: string;
  durationSeconds?: number;
};

function isRemoteUrl(url: string) {
  return /^https?:/i.test(url);
}

/**
 * Still identificable: foto, poster del video, o primer cuadro vía <video>
 * cuando la URL es el archivo firmado del hilo (no un JPEG local).
 */
export default function AttachmentStill({
  file,
  className,
  iconSize = 22,
  showDuration = true,
}: {
  file: StillSource;
  className?: string;
  iconSize?: number;
  showDuration?: boolean;
}) {
  const [duration, setDuration] = useState(file.durationSeconds);
  const mediaClass = className ?? "h-full w-full object-cover";

  let media: ReactNode;
  if (file.kind === "image" && file.previewUrl) {
    media = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.previewUrl} alt="" className={mediaClass} />
    );
  } else if (file.kind === "video" && file.previewUrl) {
    media = isRemoteUrl(file.previewUrl) ? (
      <video
        src={file.previewUrl}
        muted
        playsInline
        preload="metadata"
        className={mediaClass}
        onLoadedMetadata={(e) => {
          const next = e.currentTarget.duration;
          if (Number.isFinite(next)) setDuration(next);
        }}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.previewUrl} alt="" className={mediaClass} />
    );
  } else {
    media = (
      <span className={`flex items-center justify-center bg-zinc-900 ${mediaClass}`}>
        {file.kind === "video" ? (
          <Video size={iconSize} className="text-zinc-500" />
        ) : (
          <Paperclip size={iconSize} className="text-zinc-500" />
        )}
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
          {formatVideoBadge(duration!)}
        </span>
      ) : null}
    </span>
  );
}
