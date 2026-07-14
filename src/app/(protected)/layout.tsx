import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Guarda de acceso ligera. El middleware (proxy.ts) ya valida sesión Y membresía
// en cada request de estas rutas y redirige antes de llegar aquí, así que NO se
// repite el chequeo de `allowed_members` (era un viaje a Supabase redundante por
// navegación). Se conserva solo un getUser como defensa-en-profundidad ante un
// eventual bypass del middleware; la membresía queda centralizada en el proxy.
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return children;
}
