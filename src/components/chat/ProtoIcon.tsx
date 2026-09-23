import type { GptCraft } from "@/lib/gpt-visual";
import { cn } from "@/lib/utils";

/** Trazos SVG del prototipo (`paths` + `icon()` en runtime.js). No Lucide. */
export const PROTO_ICON_PATHS = {
  search:
    '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 4.1 4.1"/>',
  home: '<path d="m4.2 9.5 6.3-5.3a2.3 2.3 0 0 1 3 0l6.3 5.3a2 2 0 0 1 .7 1.5v7.5a2 2 0 0 1-2 2H15v-5.3a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 15.2v5.3H5.5a2 2 0 0 1-2-2V11a2 2 0 0 1 .7-1.5Z"/>',
  video:
    '<rect x="3.5" y="5.5" width="11.5" height="13" rx="3"/><path d="m15 9.8 4.2-2.6a1 1 0 0 1 1.5.8v8a1 1 0 0 1-1.5.8L15 14.2"/>',
  person:
    '<circle cx="12" cy="7.5" r="3.7"/><path d="M4.5 20.3v-1a7.5 7.5 0 0 1 15 0v1"/>',
  pin: '<path d="M18.8 10.2c0 3.6-4.1 8.2-6 10a1.1 1.1 0 0 1-1.6 0c-1.9-1.8-6-6.4-6-10a6.8 6.8 0 1 1 13.6 0Z"/><circle cx="12" cy="10" r="2.2"/>',
  camera:
    '<path d="M7 6h.8l1.1-1.8a1.8 1.8 0 0 1 1.5-.8h3.2a1.8 1.8 0 0 1 1.5.8L16.2 6h1.3a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z"/><circle cx="12" cy="12.8" r="3.6"/>',
  film: '<path d="M3.5 9h17v9a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18Z"/><path d="m3.5 9-.7-3.3a1.8 1.8 0 0 1 1.4-2.1l13.1-2.2a1.8 1.8 0 0 1 2.1 1.4l.6 3.1ZM7.2 3.2l2.6 4.5m4-5.6 2.7 4.5"/>',
  phone:
    '<rect x="6.2" y="2.8" width="11.6" height="18.4" rx="3"/><path d="M10.6 17.9h2.8"/>',
  diamond:
    '<path d="m3.8 7.5 2.8-3.3a2 2 0 0 1 1.5-.7h7.8a2 2 0 0 1 1.5.7l2.8 3.3a1.8 1.8 0 0 1 0 2.3L13 20a1.2 1.2 0 0 1-2 0L3.8 9.8a1.8 1.8 0 0 1 0-2.3Z"/><path d="M3.6 8.5h16.8M8 3.5l4 17 4-17"/>',
  play: '<path d="M7 5.3a1.6 1.6 0 0 1 2.4-1.4l10.2 6.7a1.7 1.7 0 0 1 0 2.8L9.4 20.1A1.6 1.6 0 0 1 7 18.7Z"/>',
  users:
    '<circle cx="9" cy="7.8" r="3.3"/><path d="M2.8 20v-1.1a6.2 6.2 0 0 1 12.4 0V20M16.3 4.8a3.2 3.2 0 0 1 0 6.2m2 3.5a5.2 5.2 0 0 1 2.9 4.7v.8"/>',
  grid: '<rect x="3.5" y="3.5" width="6" height="6" rx="1.8"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.8"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.8"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.8"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  arrow:
    '<path d="M4.5 12h14.8m-5.1-5.1 4.3 4.3a1.1 1.1 0 0 1 0 1.6l-4.3 4.3"/>',
} as const;

export type ProtoIconName = keyof typeof PROTO_ICON_PATHS;

export const CRAFT_PROTO_ICON: Record<GptCraft, ProtoIconName> = {
  video: "video",
  photo: "camera",
  images: "film",
  characters: "person",
  locations: "pin",
  scripts: "film",
  marketing: "diamond",
  design: "diamond",
  sales: "play",
  productivity: "grid",
  education: "users",
};

export function protoIconForCraft(craft: GptCraft | null | undefined): ProtoIconName {
  return craft ? CRAFT_PROTO_ICON[craft] : "diamond";
}

interface Props {
  name: ProtoIconName;
  className?: string;
}

export default function ProtoIcon({ name, className }: Props) {
  const paths = PROTO_ICON_PATHS[name] ?? PROTO_ICON_PATHS.film;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("h-[18px] w-[18px] shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
