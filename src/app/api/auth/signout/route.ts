import { createClient } from "@/lib/supabase/server";
import { logAuthEvent } from "@/lib/auth-events";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await logAuthEvent({
    event: "signout_user",
    email: user?.email,
    userId: user?.id,
    request,
  });

  // Scope local: cerrar sesión en el móvil no tiene por qué tumbar la laptop.
  // El default de signOut() es 'global', que hacía justo eso. La revocación real
  // (baja de Skool) sí sigue siendo global, pero la decide el gate en proxy.ts.
  await supabase.auth.signOut({ scope: "local" });

  const origin = request.nextUrl.origin;
  // 303 y no 302: es la respuesta correcta a un POST cuyo resultado se ve con un
  // GET. Con 302 los navegadores hacen lo mismo por tolerancia, no por spec.
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
