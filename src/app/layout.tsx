import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

const base = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://halo-panel.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: "Halo Models Panel",
  description: "Panel interno de gestion de Halo Models",
  // Al compartir un enlace (WhatsApp, Telegram...) se ve el logo de la agencia
  openGraph: { siteName: "Halo Models", images: [{ url: "/halo-logo.png", width: 800, height: 800, alt: "Halo Models Agency" }], type: "website", locale: "es_ES" },
  twitter: { card: "summary", images: ["/halo-logo.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
