import type { Metadata } from "next";
import { Geist, Archivo } from "next/font/google";
import { getAppSettings } from "@/lib/app-settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Display condensada para titulares y wordmark (eco de la tipografía del logo).
// Variable: peso + eje de ancho (wdth), normal e itálica. Cuerpo/UI siguen en Geist.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  style: ["normal", "italic"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAppSettings();
  return {
    metadataBase: new URL(siteUrl),
    title: `GPT ${settings.community_name}`,
    description: `Plataforma de GPTs para la comunidad de ${settings.community_name}`,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${archivo.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  );
}
