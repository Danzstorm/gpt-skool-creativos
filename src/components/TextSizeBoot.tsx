"use client";

import { useEffect } from "react";
import { applyTextSize, parseTextSize, TEXT_SIZE_DEFAULT, TEXT_SIZE_KEY } from "@/lib/text-size";

/** Aplica el tamaño persistido una vez hidratado. Vive en el layout raíz. */
export default function TextSizeBoot() {
  useEffect(() => {
    const saved = parseTextSize(localStorage.getItem(TEXT_SIZE_KEY));
    applyTextSize(saved ?? TEXT_SIZE_DEFAULT);
  }, []);
  return null;
}
