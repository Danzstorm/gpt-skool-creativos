import type { Metadata } from "next";
import { Geist, Fraunces } from "next/font/google";
import { getAppSettings } from "@/lib/app-settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Display serif alto-contraste para titulares (look editorial de estudio).
// Variable: peso + optical sizing. Cuerpo/UI siguen en Geist.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
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
    <html lang="es" className={`${geistSans.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  );
}
