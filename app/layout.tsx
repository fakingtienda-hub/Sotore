import type { Metadata } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import { landingFontVariables } from "./fonts";
import "./globals.css";
import "./storefront.css";

const geistSans = Geist({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const anton = Anton({
  weight: "400",
  variable: "--font-poster",
  subsets: ["latin"],
  display: "swap",
});

const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "Fakingstore";

export const metadata: Metadata = {
  title: {
    default: `${storeName} — Packs de patrones y recursos digitales`,
    template: `%s · ${storeName}`,
  },
  description:
    "Comprá packs digitales de patrones, plantillas, PDFs y recursos. Pago seguro, descarga inmediata.",
  applicationName: storeName,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  openGraph: {
    type: "website",
    siteName: storeName,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} ${landingFontVariables}`}
    >
      <body>{children}</body>
    </html>
  );
}