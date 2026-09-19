import type { ReactNode } from "react";
import type { GptStageKind } from "@/lib/gpt-visual";

function FrameScene() {
  return (
    <>
      <rect x="22" y="54" width="156" height="92" rx="6" />
      <path d="M22 74V54h20M178 74V54h-20M22 126v20h20M178 126v20h-20" />
      <rect className="gpt-stage-light" x="8" y="82" width="7" height="36" rx="1.5" />
      <rect className="gpt-stage-light" x="185" y="82" width="7" height="36" rx="1.5" />
    </>
  );
}

function LensScene() {
  return (
    <>
      <circle cx="100" cy="100" r="82" />
      <circle cx="100" cy="100" r="64" />
      <circle cx="100" cy="100" r="46" />
      <circle className="gpt-stage-glint" cx="132" cy="68" r="5" />
    </>
  );
}

function IrisScene() {
  return (
    <>
      <polygon points="100,18 170,59 170,141 100,182 30,141 30,59" />
      <circle cx="100" cy="100" r="54" />
      <circle cx="100" cy="100" r="28" />
    </>
  );
}

function ScanScene() {
  return (
    <>
      <rect x="42" y="34" width="116" height="132" rx="22" />
      <path d="M42 58V34h24M158 58V34h-24M42 142v24h24M158 142v24h-24" />
      <line className="gpt-stage-scan" x1="52" y1="48" x2="148" y2="48" />
    </>
  );
}

function MapScene() {
  return (
    <>
      <circle cx="100" cy="100" r="74" />
      <line x1="100" y1="26" x2="100" y2="174" />
      <line x1="26" y1="100" x2="174" y2="100" />
      <polygon points="100,52 148,100 100,148 52,100" />
    </>
  );
}

function PageScene() {
  return (
    <>
      <rect x="58" y="32" width="84" height="136" rx="6" />
      <line x1="72" y1="62" x2="128" y2="62" />
      <line x1="72" y1="82" x2="128" y2="82" />
      <line x1="72" y1="102" x2="118" y2="102" />
      <line x1="72" y1="122" x2="124" y2="122" />
    </>
  );
}

function RingScene() {
  return (
    <>
      <circle cx="100" cy="100" r="80" />
      <circle cx="100" cy="100" r="66" />
    </>
  );
}

const SCENES: Record<GptStageKind, () => ReactNode> = {
  frame: FrameScene,
  lens: LensScene,
  iris: IrisScene,
  scan: ScanScene,
  map: MapScene,
  page: PageScene,
  ring: RingScene,
};

export default function GptStageDecor({ kind }: { kind: GptStageKind }) {
  const Scene = SCENES[kind];
  return (
    <svg
      className="gpt-stage-scene"
      viewBox="0 0 200 200"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <Scene />
    </svg>
  );
}
