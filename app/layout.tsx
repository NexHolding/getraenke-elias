import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const origin =
  process.env.NEXT_PUBLIC_SITE_URL || "https://getraenke-elias.vercel.app";
export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: {
    default: "Getränke Elias – Dein Getränkemarkt in Heilbronn",
    template: "%s · Getränke Elias",
  },
  description:
    "Gute Getränke. Ganz nah. Entdecke Getränke Elias in Heilbronn: Mineralwasser, Bier, Säfte und Wein – im Markt und mit Lieferservice.",
  openGraph: {
    title: "Gute Getränke. Gute Nachbarschaft.",
    description:
      "Dein Getränkemarkt in Heilbronn. Entdecken, auswählen, liefern lassen.",
    locale: "de_DE",
    type: "website",
    images: ["/images/drinks-hero.jpg"],
  },
  twitter: { card: "summary_large_image", images: ["/images/drinks-hero.jpg"] },
  appleWebApp: { capable: true, title: "Elias", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  themeColor: "#a3be34",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" data-scroll-behavior="smooth" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
