import { memo, useEffect, useRef } from "react";

// Ranuras de la pista. La grabación entra por la derecha y empuja el historial
// hacia la izquierda; cuando se llenan todas, las más viejas se caen del borde.
const SLOTS = 96;

// Cada cuánto se captura un nivel. 55ms ≈ 18 muestras por segundo: suficiente
// para que la onda se lea como voz y no como ruido, y mucho más barato que
// redibujar en cada frame.
const SAMPLE_MS = 55;

// Ganancia empírica: la voz de conversación normal mueve la señal ~0.2-0.4 del
// rango, así que sin amplificar las barras casi no se despegan del piso.
// ponytail: constante fija; si un micrófono queda muy corto o satura, esto es
// lo que se ajusta (o se pasa a normalización por pico rodante).
const GAIN = 2.2;

const FLOOR = 0.06; // alto de una ranura vacía: el "puntito"

/**
 * Onda de audio de la grabación en curso, al estilo del dictado de ChatGPT.
 *
 * No es un medidor de nivel: es un HISTORIAL. Cada muestra entra por la derecha
 * y corre las anteriores hacia la izquierda, así se ve el relieve de lo que ya
 * dijiste y no solo el volumen del instante. Las ranuras que todavía no se
 * grabaron quedan como puntos tenues.
 *
 * Lee el mismo MediaStream que usa el MediaRecorder, así que refleja la voz
 * real. Las barras se mutan por ref y no por estado: un setState por muestra
 * re-renderizaría el composer entero 18 veces por segundo.
 */
function RecordingWave({ stream }: { stream: MediaStream }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const ctx = new AudioContext();
    // El gesto del usuario ya ocurrió (tocó el micrófono), pero Safari puede
    // entregar el contexto suspendido igual.
    if (ctx.state === "suspended") void ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    // Dominio temporal, no frecuencial: queremos amplitud (qué tan fuerte suena)
    // y no espectro. Con frecuencias la voz vive en los primeros bins y la mitad
    // de las barras quedaría muerta.
    const data = new Uint8Array(analyser.fftSize);
    const history: number[] = [];

    const id = setInterval(() => {
      analyser.getByteTimeDomainData(data);

      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const deviation = Math.abs(data[i] - 128) / 128;
        if (deviation > peak) peak = deviation;
      }

      history.push(Math.min(1, peak * GAIN));
      if (history.length > SLOTS) history.shift();

      // Anclado a la derecha: la muestra más nueva ocupa la última ranura.
      const offset = SLOTS - history.length;
      for (let i = 0; i < SLOTS; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        const recorded = i >= offset;
        const level = recorded ? history[i - offset] : 0;
        el.style.transform = `scaleY(${FLOOR + level * (1 - FLOOR)})`;
        el.style.opacity = recorded ? "0.9" : "0.3";
      }
    }, SAMPLE_MS);

    return () => {
      clearInterval(id);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  return (
    <div className="flex flex-1 items-center gap-[2px] h-9 min-w-0 px-1">
      {/* Decorativa para lectores de pantalla: el estado lo anuncia el
          aria-live del composer. */}
      {Array.from({ length: SLOTS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          aria-hidden="true"
          className="flex-1 max-w-[3px] h-6 rounded-full bg-ink origin-center will-change-transform"
          style={{ transform: `scaleY(${FLOOR})`, opacity: 0.3 }}
        />
      ))}
    </div>
  );
}

export default memo(RecordingWave);
