import { useCallback, useEffect, useState } from "react";
import {
  OPEN_PROJECTS_KEY,
  SIDEBAR_COLLAPSED_KEY,
  ensureOpenProjectId,
  isSidebarCollapsedValue,
  parseOpenProjectIds,
  sidebarCollapsedStorageValue,
  toggleOpenProjectId,
} from "@/lib/sidebar-persistence";

/**
 * Chrome del sidebar: overlay móvil, colapso de desktop y carpetas abiertas.
 *
 * El primer render es siempre expandido / carpetas plegadas. Leer localStorage
 * en el lazy initializer de useState desfasaría el HTML del servidor y
 * rompería la hidratación. El efecto de montaje aplica lo persistido después.
 *
 * No dueña threadList ni pendingProjectId: sendMessage y el move optimista
 * siguen escribiendo esas listas en UnifiedChat.
 */
export function useChatSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [openProjectIds, setOpenProjectIds] = useState<string[]>([]);

  useEffect(() => {
    // Post-hidratación a propósito: leer localStorage en el render inicial
    // desfasaría el HTML del servidor (sidebar siempre expandido en SSR).
    /* eslint-disable react-hooks/set-state-in-effect -- persistencia post-hidratación */
    if (isSidebarCollapsedValue(localStorage.getItem(SIDEBAR_COLLAPSED_KEY))) {
      setSidebarCollapsed(true);
    }
    setOpenProjectIds(parseOpenProjectIds(localStorage.getItem(OPEN_PROJECTS_KEY)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persistOpenProjects = useCallback((ids: string[]) => {
    localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(ids));
    return ids;
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsedStorageValue(next));
      return next;
    });
  }, []);

  const toggleProject = useCallback(
    (id: string) => {
      setOpenProjectIds((prev) => persistOpenProjects(toggleOpenProjectId(prev, id)));
    },
    [persistOpenProjects]
  );

  const openProject = useCallback(
    (id: string) => {
      setOpenProjectIds((prev) => {
        const next = ensureOpenProjectId(prev, id);
        return next === prev ? prev : persistOpenProjects(next);
      });
    },
    [persistOpenProjects]
  );

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const clearSearch = useCallback(() => setChatSearch(""), []);

  return {
    sidebarOpen,
    openSidebar,
    closeSidebar,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    openProjectIds,
    toggleProject,
    openProject,
    chatSearch,
    onSearchChange: setChatSearch,
    clearSearch,
  };
}
