import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { readTheme } from "@/app/_theme/read-theme";
import "./globals.css";

// Manrope servida desde el propio servidor, sin red (brief-4.0, D-3). Licencia en _fonts/OFL.txt.
const manrope = localFont({
  src: "./_fonts/manrope-latin-wght.woff2",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI WhatsApp Agent CRM",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Sin preferencia no se marca data-theme y el CSS sigue al sistema (brief-4.0, D-4).
  const theme = await readTheme();
  return (
    <html
      lang="es"
      className={manrope.variable}
      data-theme={theme === "system" ? undefined : theme}
    >
      <body>{children}</body>
    </html>
  );
}
