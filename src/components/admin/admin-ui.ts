// Clases compartidas del admin (valores del prototipo de Martin).

export const adminPrimaryClass =
  "inline-flex cursor-pointer items-center justify-center gap-[10px] rounded-[11px] border border-solid border-[#ffffff20] bg-[linear-gradient(115deg,#ff682f20,#ff165e24,#7753ff26)] px-5 py-[13px] text-[#f4f1f5] [transition:background_.2s,box-shadow_.2s,transform_.2s] hover:bg-[linear-gradient(115deg,#ff682f30,#ff165e35,#7753ff35)] hover:[box-shadow:0_0_22px_#ff165e15] active:[transform:scale(.98)]";

export const adminActionClass =
  "whitespace-nowrap rounded-[7px] p-2 text-[12px] text-[#a4a4ad] hover:bg-[#ffffff08]";

export const adminEyebrowClass = "text-[10px] leading-[1.6] tracking-[1.6px] text-[#888891]";

export const adminBrandClass =
  "font-[family-name:var(--font-display)] text-[24px] leading-[normal] font-normal tracking-[-1px]";

export const adminBrandAccentClass =
  "bg-[linear-gradient(110deg,#ffbd16,#ff165e,#ee0de4,#7753ff)] bg-clip-text text-[16px] text-transparent";

export const adminPanelClass =
  "min-w-0 rounded-[15px] border border-solid border-[#ffffff0e] bg-[#101012] p-[25px]";

export const adminMutedClass = "mt-2 text-[13px] text-[#74747f]";

export const adminSummaryTopClass = "mb-6 flex flex-wrap items-center justify-between gap-[18px] text-[17px]";

export const adminRangeCaptionClass = "mt-[9px] block text-[10px] leading-[1.6] text-[#686873]";

// Pastilla de período del Resumen (7/30/90 días y mes). Vive aquí y no en
// AdminChartPanel: un Server Component que importa de un módulo "use client"
// recibe una referencia de cliente, no el string.
export const periodPillClass = "rounded-[7px] px-[11px] py-[9px] text-[11px] text-[#888893] no-underline";

export const periodPillActiveClass = "bg-[linear-gradient(110deg,#ff682f12,#ff165e22,#7753ff22)] text-[#f0cadb]";

// Fila de persona (avatar con iniciales + nombre + correo), tarjetas y etiquetas
// de estado del prototipo (Miembros y extras del Resumen).
export const adminAvatarClass =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#242025] text-[11px] text-[#c3b7c0]";

export const adminStatClass =
  "min-w-0 rounded-[14px] border border-solid border-[#ffffff0e] bg-[#111113] p-[22px] max-[650px]:p-4";

export const adminStatusClass = {
  base: "inline-block whitespace-nowrap rounded-[20px] px-[10px] py-[6px] text-[11px]",
  active: "bg-[#39b97418] text-[#7ed8a4]",
  pending: "bg-[#e6b83c18] text-[#e6c568]",
  expired: "bg-[#ff165e09] text-[#c3a0ac]",
  neutral: "bg-[#ffffff06] text-[#b5b5bd]",
} as const;

export const adminThClass =
  "border-t border-solid border-t-[#ffffff08] py-[14px] text-left text-[10px] font-normal uppercase tracking-[1px] text-[#777781]";

export const adminTdClass = "border-t border-solid border-t-[#ffffff08] py-[14px] text-[13px]";

/** Iniciales del nombre ("Ana Ramírez" da "AR"); sin nombre, las dos primeras letras del correo. */
export function initialsOf(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}
