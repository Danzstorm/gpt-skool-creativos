import {
  ImageIcon,
  Sparkles,
  Clapperboard,
  Megaphone,
  PenLine,
  Palette,
  TrendingUp,
  Zap,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

// Icono + color por categoría: evita que todos los GPTs sin ícono propio se
// vean como la misma caja genérica en catálogo/dashboard/landing.
const CATEGORY_STYLE: Record<string, { icon: LucideIcon; accent: string }> = {
  Video: { icon: Clapperboard, accent: "rose" },
  Imágenes: { icon: ImageIcon, accent: "sky" },
  Marketing: { icon: Megaphone, accent: "amber" },
  Copywriting: { icon: PenLine, accent: "emerald" },
  Diseño: { icon: Palette, accent: "pink" },
  Ventas: { icon: TrendingUp, accent: "orange" },
  Productividad: { icon: Zap, accent: "yellow" },
  Educación: { icon: GraduationCap, accent: "cyan" },
};
const DEFAULT_STYLE = { icon: Sparkles, accent: "violet" };

const ACCENT_CLASSES: Record<string, string> = {
  rose: "from-rose-500/25 to-rose-500/5 border-rose-500/20 text-rose-300",
  sky: "from-sky-500/25 to-sky-500/5 border-sky-500/20 text-sky-300",
  amber: "from-amber-500/25 to-amber-500/5 border-amber-500/20 text-amber-300",
  emerald: "from-emerald-500/25 to-emerald-500/5 border-emerald-500/20 text-emerald-300",
  pink: "from-pink-500/25 to-pink-500/5 border-pink-500/20 text-pink-300",
  orange: "from-orange-500/25 to-orange-500/5 border-orange-500/20 text-orange-300",
  yellow: "from-yellow-500/25 to-yellow-500/5 border-yellow-500/20 text-yellow-300",
  cyan: "from-cyan-500/25 to-cyan-500/5 border-cyan-500/20 text-cyan-300",
  violet: "from-violet-500/25 to-violet-500/5 border-violet-500/20 text-violet-300",
};

export function getGptVisual(category: string | null | undefined) {
  const style = (category && CATEGORY_STYLE[category]) || DEFAULT_STYLE;
  return { Icon: style.icon, accentClasses: ACCENT_CLASSES[style.accent] };
}
