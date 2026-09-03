"use client";

import { useEffect, useState } from "react";
import { phraseFor, type Phase, type ThinkingAttachments } from "@/lib/thinking-phrases";

interface Props {
  /** Fase informada por el servidor. */
  phase: Phase;
  /** Lo que el cliente adjuntó en este turno. */
  attachments: ThinkingAttachments;
  /** `Date.now()` del momento en que se abrió el stream. */
  startedAt: number;
}

// Lo que se ve entre que se manda el mensaje y llega el primer token.
//
// El contador vive ACÁ y no en UnifiedChat a propósito: tiene que repintarse
// una vez por segundo, y subirlo al contenedor repintaría también la lista
// entera de mensajes (que puede tener cientos) una vez por segundo. Acotado a
// este componente, el re-render por tick es una sola línea de texto.
function ThinkingIndicator({ phase, attachments, startedAt }: Props) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    // Se recalcula contra startedAt en cada tick en vez de acumular +1000: un
    // intervalo no garantiza precisión y la pestaña en segundo plano lo frena,
    // así que acumular hace que el contador mienta cuanto más larga es la espera
    // — justo el caso donde el número importa.
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const phrase = phraseFor(phase, attachments, elapsedMs);

  return (
    <div className="flex items-center gap-2 text-[15px] text-zinc-400">
      {/* Un único anuncio para el lector de pantalla. La frase que rota va
          aria-hidden: si se anunciara cada cambio, el usuario recibiría una
          interrupción cada cuatro segundos durante toda la espera. */}
      <span className="sr-only" role="status" aria-live="polite">
        Generando respuesta
      </span>

      {/* motion-safe: con reduce-motion el punto se queda quieto pero sigue
          ahí. La frase y el contador no dependen de él. */}
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-cta motion-safe:animate-pulse"
      />

      <span aria-hidden="true" className="thinking-shimmer font-medium">
        {phrase}
      </span>

      {/* tabular-nums evita que la línea "salte" cuando el ancho de los dígitos
          cambia al pasar de 9s a 10s. */}
      <span aria-hidden="true" className="text-xs text-zinc-500 tabular-nums">
        {seconds}s
      </span>
    </div>
  );
}

export default ThinkingIndicator;
