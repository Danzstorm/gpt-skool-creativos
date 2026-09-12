// Preferencias del sidebar. Las claves y los valores tienen que seguir
// coincidiendo byte a byte con lo que ya hay en los navegadores: un rename
// o un "true" en vez de "1" dejaría a todo el mundo con el panel expandido
// y las carpetas plegadas el día del deploy.

export const SIDEBAR_COLLAPSED_KEY = "chat_sidebar_collapsed";
export const OPEN_PROJECTS_KEY = "chat_open_projects";

/** Solo `"1"` cuenta como colapsado. Cualquier otra cosa (incluido `"true"`) es expandido. */
export function isSidebarCollapsedValue(raw: string | null): boolean {
  return raw === "1";
}

export function sidebarCollapsedStorageValue(collapsed: boolean): "1" | "0" {
  return collapsed ? "1" : "0";
}

/**
 * Lee la lista de carpetas abiertas. JSON corrupto, un valor que no es array
 * o ids que no son string se tratan como “todo plegado”: es preferible
 * perder el acordeón a tumbar el chat.
 */
export function parseOpenProjectIds(raw: string | null): string[] {
  if (raw == null) return [];
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    return saved.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function toggleOpenProjectId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((openId) => openId !== id) : [...ids, id];
}

/** Abre la carpeta si no lo estaba. No reescribe el array si ya está. */
export function ensureOpenProjectId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}
