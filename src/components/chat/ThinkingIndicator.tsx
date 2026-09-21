"use client";

import { useEffect, useState } from "react";
import { phraseFor, type Phase, type ThinkingAttachments } from "@/lib/thinking-phrases";
import EnergyCanvas from "@/components/ui/EnergyCanvas";

interface Props {
  phase: Phase;
  attachments: ThinkingAttachments;
  startedAt: number;
}

function prototypeWord(elapsedMs: number): "Pensando" | "Creando" {
  // 850ms Pensando, luego 1100ms Creando, y se mantiene Creando.
  if (elapsedMs < 850) return "Pensando";
  return "Creando";
}

function ThinkingIndicator({ phase, attachments, startedAt }: Props) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => clearInterval(id);
  }, [startedAt]);

  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const phrase = phraseFor(phase, attachments, elapsedMs, startedAt);
  const word = prototypeWord(elapsedMs);
  // Las frases reales (fase/adjuntos) ganan cuando hay algo concreto que decir.
  const label = attachments.images || attachments.documents || phase === "code" ? phrase : word;

  return (
    <div className="prompt-wait">
      <span className="sr-only" role="status" aria-live="polite">
        Generando respuesta
      </span>
      <span className="thinking-energy" aria-hidden>
        <EnergyCanvas size={22} speed={0.0021} />
      </span>
      <span className="thinking-label" aria-hidden>
        <span>{label}</span>
      </span>
      <span aria-hidden className="tabular-nums" style={{ fontSize: 11, color: "#777780" }}>
        {seconds}s
      </span>
    </div>
  );
}

export default ThinkingIndicator;
