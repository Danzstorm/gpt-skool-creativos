import type { ReactNode } from "react";
import type { GptMarkKind } from "@/lib/gpt-visual";

// Siluetas de oficio: relleno crema + recortes oscuros. Sin pintura de vidrio
// (eso se vuelve barro a 20px). El disco de gema aporta el color y el brillo.
const FACE = "#FFF6E8";
const CUT = "rgba(8,12,18,0.52)";

function VideoEmblem() {
  return (
    <g>
      <path d="M14 32h52a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V36a4 4 0 0 1 4-4Z" fill={FACE} />
      <path d="M15 32 19.5 13h43l-4 19H15Z" fill={FACE} />
      <path d="M27 13.6 29.4 32h8.2L32.2 13.8Z" fill={CUT} />
      <path d="M43 14.2 45 32h8L49.4 14.6Z" fill={CUT} />
      <path d="M32 42.5v17.2l16.4-8.6-16.4-8.6Z" fill={CUT} />
    </g>
  );
}

function PhotoEmblem() {
  return (
    <g>
      <rect x="28" y="14" width="18" height="9" rx="2.2" fill={FACE} />
      <rect x="10" y="21" width="60" height="46" rx="9" fill={FACE} />
      <circle cx="40" cy="46" r="15.5" fill={CUT} />
      <circle cx="40" cy="46" r="9" fill={FACE} />
      <circle cx="40" cy="46" r="4" fill={CUT} />
      <rect x="16" y="28" width="9" height="7" rx="1.6" fill={CUT} />
    </g>
  );
}

function ImagesEmblem() {
  return (
    <g>
      <rect x="24" y="11" width="42" height="32" rx="5" fill={FACE} />
      <rect x="28" y="15" width="34" height="24" rx="3" fill={CUT} />
      <rect x="12" y="28" width="44" height="36" rx="5" fill={FACE} />
      <rect x="17" y="34" width="34" height="24" rx="3" fill={CUT} />
    </g>
  );
}

function CharactersEmblem() {
  return (
    <g>
      <circle cx="40" cy="26" r="15" fill={FACE} />
      <path d="M15 70c1.4-16 12.2-24 25-24s23.6 8 25 24H15Z" fill={FACE} />
    </g>
  );
}

function LocationsEmblem() {
  return (
    <g>
      <path
        d="M40 10c-12.4 0-22 9.6-22 22.2 0 16.6 22 37.8 22 37.8s22-21.2 22-37.8C62 19.6 52.4 10 40 10Z"
        fill={FACE}
      />
      <circle cx="40" cy="31" r="9" fill={CUT} />
    </g>
  );
}

function ScriptsEmblem() {
  return (
    <g>
      <path d="M16 12h32l14 14v40a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" fill={FACE} />
      <path d="M48 12v12a2 2 0 0 0 2 2h12" fill={CUT} />
      <path d="M22 34h24M22 44h22M22 54h16" stroke={CUT} strokeWidth="4" strokeLinecap="round" />
      <path d="M50 48 66 30l7 6-16 18-8.4-2.4Z" fill={CUT} />
      <path d="M66 30 70 22l8 4-5 9Z" fill={FACE} />
    </g>
  );
}

function GemEmblem() {
  return (
    <g>
      <path d="M40 8 66 24v32L40 72 14 56V24Z" fill={FACE} />
      <path d="M40 18 56 28v24L40 62 24 52V28Z" fill={CUT} />
    </g>
  );
}

const EMBLEMS: Record<GptMarkKind, () => ReactNode> = {
  video: VideoEmblem,
  photo: PhotoEmblem,
  images: ImagesEmblem,
  characters: CharactersEmblem,
  locations: LocationsEmblem,
  scripts: ScriptsEmblem,
  gem: GemEmblem,
};

interface Props {
  kind: GptMarkKind;
  uid: string;
  letter: string;
}

export default function GptEmblem({ kind }: Props) {
  const Emblem = EMBLEMS[kind];

  return (
    <svg viewBox="0 0 80 80" className="gpt-mark-svg" aria-hidden>
      <Emblem />
    </svg>
  );
}
