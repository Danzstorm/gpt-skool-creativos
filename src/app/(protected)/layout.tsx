import { createClient } from "@/lib/supabase/server";
import { isAllowedMember } from "@/lib/membership";
import { redirect } from "next/navigation";

// Solo guarda de acceso (sesión + whitelist). Sin header: cada grupo de rutas
// decide su propio shell — (with-header) para catálogo/admin-like, chat es
// fullscreen sin header (ver AGENTS.md sobre route groups de este Next.js).
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

  // Defensa: si el usuario fue removido de la lista, cerrar sesión.
  if (!(await isAllowedMember(user.email))) {
    await supabase.auth.signOut();
    redirect("/unauthorized");
  }

  return children;
}
