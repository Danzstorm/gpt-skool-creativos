"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Reacciona a la muerte de la sesión en el navegador.
 *
 * El JWT dura 1h y se renueva por rotación de refresh token. Si esa renovación
 * falla (dos pestañas compitiendo dentro de la ventana de reuso, cookies
 * borradas, portátil suspendido días), la app se quedaba congelada: los fetch
 * empezaban a fallar sin que nada lo explicara, y solo al recargar aparecía el
 * login — mudo. Esto lo convierte en un mensaje.
 *
 * No pinta nada; va montado en el layout protegido.
 */
export default function AuthWatcher() {
  // Al montar, supabase-js emite INITIAL_SESSION y puede emitir SIGNED_OUT si
  // todavía no leyó la cookie. Redirigir con eso sería un bucle: /login ve una
  // sesión válida en el servidor y devuelve a /chat, que vuelve a montar esto.
  // Solo se actúa sobre una sesión que existió de verdad en este cliente.
  const hadSession = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        hadSession.current = true;
        return;
      }
      if (event === "SIGNED_OUT" && hadSession.current) {
        // Navegación completa, no el router de Next: hay que repasar por el
        // proxy y descartar todo el árbol de una sesión que ya no existe.
        window.location.assign("/login?error=session_expired");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
