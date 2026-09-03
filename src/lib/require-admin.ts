import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Comprobación de admin compartida por todas las superficies de /admin.
 *
 * Vivía copiada literalmente en 12 route handlers. Ninguna copia había
 * divergido todavía, pero un control de acceso con 12 puntos de edición es un
 * agujero silencioso esperando a que alguien clone el endpoint de al lado y se
 * salte una línea. Aquí hay un solo sitio donde vive la regla.
 *
 * Devuelve el usuario cuando es admin y null en cualquier otro caso: sin
 * sesión, sin perfil (todavía no hizo su primer login) o sin la bandera.
 */
export async function requireAdmin(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // maybeSingle y no single: un perfil inexistente es un "no", no un error.
  // single() devuelve PGRST116 en ese caso y ensucia los logs con un fallo que
  // no lo es.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.is_admin ? user : null;
}
