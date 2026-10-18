"use client";

import { ErrorPanel } from "@/app/_components/error-panel";

// Una excepción no prevista en una pantalla autenticada, dentro del marco (brief-23.2, D-4).
// `retry` vuelve a pedir la pantalla al servidor y la dibuja de nuevo.
export default function AuthenticatedError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ErrorPanel digest={error.digest} onRetry={retry} />
    </main>
  );
}
