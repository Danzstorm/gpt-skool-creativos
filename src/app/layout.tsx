import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Inconsolata } from "next/font/google";
import { getAppSettings } from "@/lib/app-settings";
import TextSizeBoot from "@/components/TextSizeBoot";
import "./globals.css";
import "./prototype.css";
import "./prototype-compat.css";
import "../components/chat/composer.css";
import "../components/chat/home.css";
import "../components/chat/gpt-intro.css";
import "../components/chat/messages.css";
import "../components/chat/sidebar-menus.css";
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const inconsolata = Inconsolata({
  variable: "--font-inconsolata",
  subsets: ["latin"],
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
    // SVG para navegadores de escritorio; .ico para buscadores y clientes que
    // solo piden /favicon.ico; PNG para iPhone/Safari (no usan SVG como ícono).
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "48x48" },
      ],
      shortcut: "/favicon.ico",
      apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jakarta.variable} ${inconsolata.variable} h-full`}
    >
      <body className="h-full min-h-full antialiased">
        <TextSizeBoot />
        {children}
      </body>
    </html>
  );
}
