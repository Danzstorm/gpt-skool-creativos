import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { INITIAL_LEVEL_STATE, nextLevel, rmsOf, type LevelState } from "@/lib/audio-level";
import { slotsForWidth, GAP_PX } from "@/lib/wave-slots";

// Ranuras de arranque, antes de medir. Se reemplaza en el primer layout.
const INITIAL_SLOTS = 40;

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
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState(INITIAL_SLOTS);

  // La cantidad de barras sale del ancho real, no de una constante. Va en
  // useLayoutEffect y no en useEffect para medir ANTES del primer pintado: si no,
  // se alcanza a ver un cuadro con las barras de arranque, más gruesas.
  // Solo corre en el cliente (el componente se monta al empezar a grabar).
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    const measure = () => setSlots(slotsForWidth(el.clientWidth));
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const shown = new Float32Array(slots);

    // Al achicarse la tira quedan refs de barras que ya no se renderizan; sin
    // esto el array seguiría reteniendo nodos sueltos.
    barsRef.current.length = slots;

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
        if (history.length > slots) history.shift();
      }

      // Anclado a la derecha: la muestra más nueva ocupa la última ranura.
      const offset = slots - history.length;
      for (let i = 0; i < slots; i++) {
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
    // `slots` entra en las dependencias a propósito: el bucle de dibujado lo
    // captura, así que sin esto una remedida dejaría la animación escribiendo
    // sobre un `shown` del tamaño viejo.
  }, [stream, slots]);

  return (
    <div
      ref={stripRef}
      className="flex flex-1 items-center h-9 min-w-0 px-1"
      style={{ gap: GAP_PX }}
    >
      {/* Decorativa para lectores de pantalla: el estado lo anuncia el
          aria-live del composer. */}
      {Array.from({ length: slots }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          aria-hidden="true"
          className="flex-1 h-6 rounded-full bg-ink origin-center will-change-transform"
          // SIN tope de ancho, a propósito. Un `max-width` acá fue justo el bug
          // original: las barras se topaban, la tira se quedaba a media máquina
          // y el sobrante era hueco muerto a la derecha. Sin tope, el reparto de
          // flex llena el ancho SIEMPRE, cualquiera sea `slots`. La medición
          // pasa a decidir solo la densidad (barras finas o gruesas), nunca si
          // la onda llega o no hasta el final: si fallara, se ven barras más
          // anchas, que es un defecto cosmético y no una onda cortada al medio.
          style={{ transform: `scaleY(${FLOOR})`, opacity: 0.3 }}
        />
      ))}
    </div>
  );
}

export default memo(RecordingWave);
