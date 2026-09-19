import { useCallback, useEffect, useState } from "react";
import {
  RECENT_GPTS_KEY,
  parseRecentGptIds,
  recentGptsStorageValue,
  touchRecentGptId,
} from "@/lib/gpt-recents";

/**
 * Orden de GPTs recientes. El primer render es [] a propósito: leer
 * localStorage en el lazy initializer desfasaría el HTML del servidor.
 * El efecto de montaje aplica lo persistido después, igual que el colapso
 * del sidebar.
 */
export function useRecentGpts() {
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- persistencia post-hidratación */
    setRecentIds(parseRecentGptIds(localStorage.getItem(RECENT_GPTS_KEY)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const touchRecent = useCallback((gptId: string) => {
    if (!gptId) return;
    setRecentIds((prev) => {
      const next = touchRecentGptId(prev, gptId);
      localStorage.setItem(RECENT_GPTS_KEY, recentGptsStorageValue(next));
      return next;
    });
  }, []);

  return { recentIds, touchRecent };
}
