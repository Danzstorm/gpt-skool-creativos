import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Consulta de membresía apta para el runtime de proxy: usa supabase-js directo
// (service role, salta RLS) sin importar `next/headers`, que no existe aquí.
async function isActiveMember(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await service
    .from("allowed_members")
    .select("is_active")
    .eq("email", email.toLowerCase().trim())
    .single();
  return !!data?.is_active;
}

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
  const isApi = pathname.startsWith("/api/");

  // APIs que deben responder sin sesión (el webhook se autentica con su propio
  // secreto; check-email corre antes del login).
  const publicApi =
    pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/auth/check-email");

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
    const isMember = await isActiveMember(user.email);
    if (!isMember) {
      await supabase.auth.signOut();
      if (isApi) {
        return withCookies(
          NextResponse.json({ error: "Acceso revocado" }, { status: 403 }),
          supabaseResponse
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
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
