import { createServiceClient } from "@/lib/supabase/server";
import type { AppSettings } from "@/lib/types";

const DEFAULTS: AppSettings = {
  community_name: "Creativos",
  logo_url: null,
  skool_url: process.env.NEXT_PUBLIC_SKOOL_URL || "https://www.skool.com/",
  support_email: null,
  default_monthly_message_limit: null,
};

// Fila única de configuración de marca (white-label). Se usa en landing, login,
// header y mensajes de acceso — así reemplazar "Creativos" por la marca de un
// cliente nuevo es editar una fila, no tocar código.
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const service = createServiceClient();
    const { data } = await service.from("app_settings").select("*").eq("id", 1).single();
    if (!data) return DEFAULTS;
    return {
      community_name: data.community_name || DEFAULTS.community_name,
      logo_url: data.logo_url,
      skool_url: data.skool_url || DEFAULTS.skool_url,
      support_email: data.support_email,
      default_monthly_message_limit: data.default_monthly_message_limit,
    };
  } catch (error) {
    // Un fallo de red hace que supabase-js LANCE, no que devuelva {error}. Sin
    // este catch, un blip de Supabase (o el free tier pausándose) tumbaba el
    // prerender de /login —la página que ve todo el mundo— con un 500, y hacía
    // fallar el build en cualquier entorno sin acceso a la base.
    //
    // Esto es branding, no autorización: quedarse con los valores por defecto
    // no abre ningún acceso, solo muestra el nombre genérico. El gate real vive
    // en proxy.ts y en auth/callback.
    console.error("getAppSettings: fallo de lectura, se usan valores por defecto", error);
    return DEFAULTS;
  }
}
