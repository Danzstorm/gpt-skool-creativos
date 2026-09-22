export const TEXT_SIZE_KEY = "creativos-text-size";
export const TEXT_SIZE_MIN = 85;
export const TEXT_SIZE_MAX = 125;
export const TEXT_SIZE_STEP = 5;
export const TEXT_SIZE_DEFAULT = 100;
export const TEXT_SIZE_STYLE_ID = "creativos-text-size-rules";

export function clampTextSize(value: number): number {
  return Math.max(TEXT_SIZE_MIN, Math.min(TEXT_SIZE_MAX, value));
}

export function parseTextSize(raw: string | null): number | null {
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) ? clampTextSize(value) : null;
}

/**
 * Selectores y bases del prototipo (`fontRules` en runtime.js).
 * Bases < 20px suman 0.75px y luego se multiplican por el porcentaje/100.
 * Títulos grandes se multiplican directo. Nunca `zoom` de página.
 */
export const TEXT_SIZE_RULES: [string, number][] = [
  [".nav,.folder-heading,.history .nav,.projects-section .history-item", 13],
  [".label", 11],
  [".profile strong", 12],
  [".profile span:last-child", 11],
  [".tool h3", 16],
  [".tool p", 13],
  [".filter,.search input,.side-search input", 12],
  ["#composer textarea,.composer-row textarea,.mention-field", 14],
  [".message.user", 14],
  [".prompt-body", 13],
  [".prompt-label,.prompt-copy", 11],
  ["#chatIntro .gpt-title-row h1", 46],
  ["#chatIntro p,#chatIntro>p,#chatIntro .gpt-intro-copy,.chat-intro p", 17],
  [".note,.compose-hint", 10],
  [".intro h1", 37],
  [".intro p:last-child", 13],
  [".account-menu>button,.music-options button", 13],
  [".folder-options button", 11],
  [".settings-dialog label,.type-preview", 13],
  [".access-main .access-description", 14],
  [".access-notes .access-hint", 11],
  ["#accessContinue", 12],
];

export function scaledPx(base: number, percent: number): number {
  const factor = clampTextSize(percent) / 100;
  return (base < 20 ? base + 0.75 : base) * factor;
}

export function textSizeCss(percent: number): string {
  const size = clampTextSize(percent);
  const factor = size / 100;
  const rules = TEXT_SIZE_RULES.map(
    ([selector, px]) => `${selector}{font-size:${scaledPx(px, size)}px!important}`
  ).join("");
  return (
    `:root{--text-scale:${factor}}` +
    rules +
    `#chatIntro p,#chatIntro .gpt-intro-copy,.chat-intro p{letter-spacing:0!important;word-spacing:normal!important;-webkit-text-fill-color:currentColor!important}` +
    `.compose-hint,.note,.label,.nav,.new,.chat-name,.history-item,.folder-heading,.profile strong,.profile span:last-child{letter-spacing:0!important;word-spacing:.06em!important;-webkit-text-fill-color:currentColor!important}` +
    `#chatIntro p,#chatIntro .gpt-intro-copy,.chat-intro p,.compose-hint,.note{background:none!important;background-clip:border-box!important;-webkit-background-clip:border-box!important}` +
    `@media(max-width:650px){#chatIntro .gpt-title-row h1{font-size:${32 * factor}px!important}.intro h1{font-size:${30 * factor}px!important}}`
  );
}

/**
 * Inyecta las reglas de tamaño. No toca `documentElement.style.fontSize`
 * (eso escala rem de Tailwind y se siente zoom) ni `zoom` de página.
 */
export function applyTextSize(percent: number): void {
  if (typeof document === "undefined") return;
  const size = clampTextSize(percent);
  let el = document.getElementById(TEXT_SIZE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = TEXT_SIZE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = textSizeCss(size);
  document.documentElement.style.setProperty("--text-scale", String(size / 100));
}
