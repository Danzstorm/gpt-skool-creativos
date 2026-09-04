import { memo, useEffect, useRef } from "react";
import { INITIAL_LEVEL_STATE, nextLevel, rmsOf, type LevelState } from "@/lib/audio-level";

// Menos barras y más anchas que la versión anterior (eran 96 de 3px con 2px de
// separación, que a esa densidad se lee como una trama y no como una onda).
const SLOTS = 40;

// Cada cuánto ENTRA una muestra nueva al historial. El dibujado no depende de
// esto: corre por requestAnimationFrame y va interpolando entre muestras, así
// que 60ms de muestreo no se ven como 16 saltos por segundo.
const SAMPLE_MS = 60;

// Cuánto se acerca cada barra a su objetivo en cada frame. Más alto = más
// pegado al dato y más nervioso; más bajo = más suave pero con retardo
// perceptible al empezar a hablar.
const EASING = 0.28;

const FLOOR = 0.08; // alto de una ranura vacía: el "puntito"

// El ataque/caída y la normalización contra pico rodante viven en
// src/lib/audio-level.ts, que es donde se pueden testear.

/**
 * Onda de audio de la grabación en curso, al estilo del dictado de ChatGPT.
 *
 * No es un medidor de nivel: es un HISTORIAL. Cada muestra entra por la derecha
 * y corre las anteriores hacia la izquierda, así se ve el relieve de lo que ya
 * dijiste y no solo el volumen del instante. Las ranuras que todavía no se
 * grabaron quedan como puntos tenues.
 *
 * Lee el mismo MediaStream que usa el MediaRecorder, así que refleja la voz
 * real. Las barras se mutan por ref y no por estado: un setState por frame
 * re-renderizaría el composer entero 60 veces por segundo.
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
    // Lo que se está mostrando ahora mismo, que persigue a `history`. Son dos
    // cosas distintas: el historial salta cada SAMPLE_MS, esto se desliza.
    const shown = new Float32Array(SLOTS);

    let levelState: LevelState = INITIAL_LEVEL_STATE;
    let lastSampleAt = 0;
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);

      if (now - lastSampleAt >= SAMPLE_MS) {
        lastSampleAt = now;

        analyser.getByteTimeDomainData(data);

        const advanced = nextLevel(levelState, rmsOf(data));
        levelState = advanced.state;

        history.push(advanced.level);
        if (history.length > SLOTS) history.shift();
      }

      // Anclado a la derecha: la muestra más nueva ocupa la última ranura.
      const offset = SLOTS - history.length;
      for (let i = 0; i < SLOTS; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        const recorded = i >= offset;
        const target = recorded ? history[i - offset] : 0;

        // Aquí está la fluidez: la barra no salta al valor nuevo, se acerca un
        // porcentaje por frame. Como el historial se corre una posición cada
        // SAMPLE_MS, el conjunto se lee como una onda que fluye en vez de una
        // fila de barras que parpadean.
        shown[i] += (target - shown[i]) * EASING;

        el.style.transform = `scaleY(${FLOOR + shown[i] * (1 - FLOOR)})`;
        el.style.opacity = recorded ? "0.9" : "0.3";
      }
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  return (
    <div className="flex flex-1 items-center gap-[3px] h-9 min-w-0 px-1">
      {/* Decorativa para lectores de pantalla: el estado lo anuncia el
          aria-live del composer. */}
      {Array.from({ length: SLOTS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          aria-hidden="true"
          className="flex-1 max-w-[4px] h-6 rounded-full bg-ink origin-center will-change-transform"
          style={{ transform: `scaleY(${FLOOR})`, opacity: 0.3 }}
        />
      ))}
    </div>
  );
}

export default memo(RecordingWave);
