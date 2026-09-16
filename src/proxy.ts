import { createServerClient } from "@supabase/ssr";
import { apiAccessForPath } from "@/lib/api-access-policy";
import { logAuthEvent } from "@/lib/auth-events";
import { isActiveMemberForProxy } from "@/lib/membership";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // icon/apple-icon/opengraph-image son rutas generadas por Next (next/og) para
  // favicon y preview de link — deben verse sin sesión (visitantes, crawlers de Skool/redes).
  const publicPaths = [
    "/login",
    "/unauthorized",
    "/auth/callback",
    "/icon",
    "/apple-icon",
    "/opengraph-image",
  ];
  const isPublic = pathname === "/" || publicPaths.some((p) => pathname.startsWith(p));
  const apiAccess = apiAccessForPath(pathname);
  const isApi = apiAccess !== "not-api";
  const publicApi = apiAccess === "session-exempt";

  // Default-deny para APIs: una ruta nueva queda protegida aunque su handler
  // olvide comprobar la sesión. Las únicas excepciones explícitas viven en
  // api-access-policy.ts (pre-login y webhooks con secreto propio).
  if (!user && apiAccess === "authenticated") {
    return withCookies(
      NextResponse.json({ error: "No autenticado" }, { status: 401 }),
      supabaseResponse
    );
  }

  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Gate de membresía en cada request autenticado (páginas y API). Si el usuario
  // fue dado de baja del Skool (allowed_members.is_active = false), se corta el
  // acceso al instante —sin depender de recargar una página protegida— y se cierra
  // la sesión. Cubre login, refresh y llamadas directas a la API.
  if (user && !isPublic && !publicApi) {
    const isMember = await isActiveMemberForProxy(user.email);
    if (!isMember) {
      // Auditar ANTES de cerrar: sin este registro, un cierre de sesión es
      // indistinguible de un bug y solo se puede reconstruir leyendo logs
      // crudos de GoTrue (y ni así del todo).
      await logAuthEvent({
        event: "signout_gate_revoked",
        email: user.email,
        userId: user.id,
        reason: "allowed_members.is_active = false",
        request,
      });
      // Scope global explícito: esto es una baja real de la comunidad, debe
      // cortar en todos los dispositivos. Es lo contrario del botón "Salir",
      // que solo cierra el dispositivo desde el que se pulsa.
      await supabase.auth.signOut({ scope: "global" });
      if (isApi) {
        return withCookies(
          NextResponse.json(
            // `code` para que el cliente distinga esto de un 403 por cuota; sin
            // él, el chat pintaba "Alcanzaste tu límite de mensajes de este mes".
            { error: "Acceso revocado", code: "membership_revoked" },
            { status: 403 }
          ),
          supabaseResponse
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.searchParams.set("reason", "revoked");
      return withCookies(NextResponse.redirect(url), supabaseResponse);
    }
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Copia las cookies escritas por Supabase (p. ej. el signOut que limpia la sesión)
// a una respuesta distinta (redirect / json), que de otro modo las perdería.
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  source.cookies.getAll().forEach((c) => target.cookies.set(c));
  return target;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
