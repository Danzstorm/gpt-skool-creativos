import type { ReactNode } from "react";
import type { GptMarkKind } from "@/lib/gpt-visual";

interface Paint {
  face: string;
  edge: string;
  well: string;
  depth: string;
  sheen: string;
  core: string;
}

function glassPaint(uid: string): { defs: ReactNode; paint: Paint } {
  const paint: Paint = {
    face: `${uid}-face`,
    edge: `${uid}-edge`,
    well: `${uid}-well`,
    depth: `${uid}-depth`,
    sheen: `${uid}-sheen`,
    core: `${uid}-core`,
  };

  const defs = (
    <defs>
      <linearGradient id={paint.face} x1="12%" y1="4%" x2="90%" y2="96%">
        <stop offset="0" stopColor="#fff" stopOpacity="0.96" />
        <stop offset="0.32" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="0.68" stopColor="var(--craft)" stopOpacity="0.28" />
        <stop offset="1" stopColor="#1a1018" stopOpacity="0.72" />
      </linearGradient>
      <linearGradient id={paint.edge} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="var(--craft)" stopOpacity="0.55" />
        <stop offset="1" stopColor="#0c0610" stopOpacity="0.62" />
      </linearGradient>
      <radialGradient id={paint.well} cx="34%" cy="28%" r="74%">
        <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
        <stop offset="0.42" stopColor="var(--craft)" stopOpacity="0.38" />
        <stop offset="1" stopColor="#050308" stopOpacity="0.78" />
      </radialGradient>
      <radialGradient id={paint.sheen} cx="30%" cy="24%" r="50%">
        <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
        <stop offset="0.4" stopColor="#fff" stopOpacity="0.22" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={paint.core} x1="30%" y1="0" x2="70%" y2="100%">
        <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
        <stop offset="1" stopColor="#0a0610" stopOpacity="0.55" />
      </linearGradient>
      <filter id={paint.depth} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0.8" dy="2.2" stdDeviation="1.4" floodColor="#000" floodOpacity="0.5" />
      </filter>
    </defs>
  );

  return { defs, paint };
}

function VideoEmblem({ paint }: { paint: Paint }) {
  return (
    <g filter={`url(#${paint.depth})`}>
      <ellipse cx="22" cy="54" rx="15" ry="15" fill={`url(#${paint.well})`} stroke={`url(#${paint.edge})`} strokeWidth="1.4" />
      <ellipse cx="22" cy="54" rx="5.2" ry="5.2" fill={`url(#${paint.face})`} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <circle
            key={deg}
            cx={22 + Math.cos(rad) * 9.2}
            cy={54 + Math.sin(rad) * 9.2}
            r="1.7"
            fill="#08050c"
            opacity="0.65"
          />
        );
      })}
      <path
        d="M24 34 70 27.5 73 64 27 68.5Z"
        fill={`url(#${paint.face})`}
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1.2"
      />
      <path d="M33 42h28M33 50h26M33 58h22" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M23.5 32.5 69 24.5 66.5 14.5 25.8 22.8Z"
        fill={`url(#${paint.edge})`}
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="0.9"
      />
      <path d="M31 24.2 35.6 32.4 41.2 22.6Z" fill="#0a0610" opacity="0.42" />
      <path d="M42.4 22.2 47.2 31.2 52.8 20.8Z" fill="#fff" opacity="0.38" />
      <path d="M54 20.6 58.8 29.8 64.4 19.2Z" fill="#0a0610" opacity="0.42" />
      <circle cx="27.8" cy="28.4" r="2" fill={`url(#${paint.sheen})`} />
      <circle cx="32.2" cy="27.4" r="2" fill={`url(#${paint.sheen})`} />
      <ellipse cx="42" cy="40" rx="12" ry="5" fill={`url(#${paint.sheen})`} opacity="0.55" />
    </g>
  );
}

function PhotoEmblem({ paint }: { paint: Paint }) {
  return (
    <g filter={`url(#${paint.depth})`}>
      <circle cx="40" cy="40" r="26" fill={`url(#${paint.edge})`} />
      <circle cx="40" cy="40" r="21" fill={`url(#${paint.well})`} />
      <circle cx="40" cy="40" r="15" fill={`url(#${paint.face})`} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <path
        d="M40 28.4 48.4 33.2 48.4 42.8 40 47.6 31.6 42.8 31.6 33.2Z"
        fill="#08050c"
        fillOpacity="0.62"
        stroke={`url(#${paint.edge})`}
        strokeWidth="0.9"
      />
      <circle cx="40" cy="38" r="4" fill={`url(#${paint.well})`} />
      <ellipse cx="31" cy="29" rx="9" ry="4.2" fill={`url(#${paint.sheen})`} />
    </g>
  );
}

function ImagesEmblem({ paint }: { paint: Paint }) {
  const blades = [
    "M40 12 52.5 27.5 40 34 27.5 27.5Z",
    "M62 22 68 40 52.5 42.5 46.5 27.5Z",
    "M68 40 62 58 46.5 52.5 52.5 42.5Z",
    "M40 68 27.5 52.5 40 46 52.5 52.5Z",
    "M18 58 12 40 27.5 37.5 33.5 52.5Z",
    "M12 40 18 22 33.5 27.5 27.5 37.5Z",
  ];
  return (
    <g filter={`url(#${paint.depth})`}>
      <circle cx="40" cy="40" r="26" fill={`url(#${paint.well})`} stroke={`url(#${paint.edge})`} strokeWidth="1.4" />
      {blades.map((d) => (
        <path key={d} d={d} fill={`url(#${paint.face})`} stroke="rgba(255,255,255,0.28)" strokeWidth="0.7" />
      ))}
      <circle cx="40" cy="40" r="8.4" fill="#08050c" fillOpacity="0.7" />
      <circle cx="40" cy="40" r="5.2" fill={`url(#${paint.well})`} />
      <ellipse cx="30" cy="27" rx="9" ry="3.8" fill={`url(#${paint.sheen})`} />
    </g>
  );
}

function CharactersEmblem({ paint }: { paint: Paint }) {
  return (
    <g filter={`url(#${paint.depth})`}>
      <ellipse cx="40" cy="40" rx="25" ry="28" fill="none" stroke={`url(#${paint.edge})`} strokeWidth="1.2" opacity="0.45" />
      <path
        d="M28 62c.8-9.4 6.6-16.2 14.8-18.4C38.4 41 35.2 35.6 35.2 29.4 35.2 21.2 41.6 15 49.2 15c7.4 0 13.6 6 13.6 14.2 0 6.4-3.4 11.8-8.4 14.4 8.6 2.4 14.8 10.2 15.6 18.4H28Z"
        fill={`url(#${paint.face})`}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
      />
      <path className="gpt-mark-scan" d="M18 42h46" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.72" />
      <ellipse cx="44" cy="26" rx="7" ry="3.2" fill={`url(#${paint.sheen})`} />
    </g>
  );
}

function LocationsEmblem({ paint }: { paint: Paint }) {
  return (
    <g filter={`url(#${paint.depth})`}>
      <path d="M10 60c10-9 18-6 26 1 9-12 18-9 28 3 8-7 14-4 22 3" fill="none" stroke={`url(#${paint.edge})`} strokeWidth="1.6" opacity="0.55" />
      <path d="M12 62 30 44l12 10 18-20 16 22" fill={`url(#${paint.well})`} opacity="0.5" />
      <path
        d="M40 12c-9.6 0-17.4 7.8-17.4 17.2 0 12.4 17.4 28.8 17.4 28.8S57.4 41.6 57.4 29.2C57.4 19.8 49.6 12 40 12Z"
        fill={`url(#${paint.face})`}
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1.2"
      />
      <circle cx="40" cy="28.8" r="6.6" fill={`url(#${paint.well})`} />
      <ellipse cx="34" cy="22.5" rx="6.4" ry="3" fill={`url(#${paint.sheen})`} />
    </g>
  );
}

function ScriptsEmblem({ paint }: { paint: Paint }) {
  return (
    <g filter={`url(#${paint.depth})`}>
      <path
        d="M18 14 58 9.5 64 66 23 70.5Z"
        fill={`url(#${paint.face})`}
        stroke="rgba(255,255,255,0.42)"
        strokeWidth="1.2"
      />
      <path d="M50 10 64 11.2 58.4 22.6Z" fill={`url(#${paint.edge})`} />
      <path d="M28 26h24M29 36h22M29 46h17" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M46 50 60 40l9 9-9 7-4.2-1.6Z"
        fill={`url(#${paint.edge})`}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="0.8"
      />
      <path d="M60 40 65 30l9 4.4-6.4 9.2Z" fill={`url(#${paint.core})`} />
      <ellipse cx="32" cy="20" rx="10" ry="3.6" fill={`url(#${paint.sheen})`} />
    </g>
  );
}

const EMBLEMS: Record<Exclude<GptMarkKind, "gem">, (props: { paint: Paint }) => ReactNode> = {
  video: VideoEmblem,
  photo: PhotoEmblem,
  images: ImagesEmblem,
  characters: CharactersEmblem,
  locations: LocationsEmblem,
  scripts: ScriptsEmblem,
};

interface Props {
  kind: GptMarkKind;
  uid: string;
  letter: string;
}

export default function GptEmblem({ kind, uid, letter }: Props) {
  if (kind === "gem") {
    return (
      <span className="gpt-mark-letter font-display italic uppercase font-extrabold">{letter}</span>
    );
  }

  const { defs, paint } = glassPaint(uid);
  const Emblem = EMBLEMS[kind];

  return (
    <svg viewBox="0 0 80 80" className="gpt-mark-svg" aria-hidden>
      {defs}
      <Emblem paint={paint} />
    </svg>
  );
}
