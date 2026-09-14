import type { ReactNode } from "react";

// Columna centrada de la pantalla 1, a ancho completo en móvil (wireframe 01). Sin marco común.
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-center text-xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-3 text-sm text-slate-700">{description}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
