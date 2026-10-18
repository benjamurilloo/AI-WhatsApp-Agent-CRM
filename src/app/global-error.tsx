"use client";

import { ErrorPanel } from "@/app/_components/error-panel";
import "./globals.css";

// Un error en el propio layout raíz (brief-23.2, D-4): reemplaza el documento entero, así que lleva
// su <html>, su <body> y los estilos globales. Sin marco y con el tema del sistema. La CSP no
// admite estilos en línea (`style-src-attr 'none'`), por eso todo va con clases.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <title>Error — AI WhatsApp Agent CRM</title>
        <main className="mx-auto max-w-6xl px-4 py-8">
          <ErrorPanel digest={error.digest} onRetry={retry} />
        </main>
      </body>
    </html>
  );
}
