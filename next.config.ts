import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const supabaseOrigin = supabaseHost ? `https://${supabaseHost}` : "";

// La app no carga NI un solo script, hoja de estilos o fuente de un tercero:
// next/font auto-hospeda Geist y Fraunces en el build, y el único enlace externo
// (skool.com) es navegación, no una subcarga. Por eso la política puede ser
// estricta sin listas de permitidos que mantener.
//
// 'unsafe-inline' en script-src es la concesión obligada: Next inyecta su
// bootstrap y la carga útil RSC como scripts inline, y quitarlo exige nonces por
// request desde el proxy. Se puede hacer más adelante; no es motivo para
// quedarse sin el resto de la política.
//
// Va en Report-Only a propósito. Una CSP mal calibrada rompe producción en
// silencio y esta app es la que usa la comunidad a diario: primero se observan
// los informes, después se pasa a modo bloqueo.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  // Tailwind y next/font emiten estilos inline.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // blob: y data: son las miniaturas locales del composer antes de subirse.
  // lh3.googleusercontent.com es la foto de perfil de quien entra con Google:
  // sin ella acá, el avatar del sidebar se rompe en cuanto la CSP pase de
  // Report-Only a modo bloqueo.
  `img-src 'self' data: blob: https://lh3.googleusercontent.com ${supabaseOrigin}`.trim(),
  // blob: es la reproducción del audio grabado antes de transcribirlo.
  "media-src 'self' blob:",
  // Supabase (REST, Auth, Storage y Realtime por WebSocket) y el streaming SSE
  // propio, que es mismo origen.
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")}`.trim(),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El micrófono SÍ hace falta: el composer graba audio para transcribirlo.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
