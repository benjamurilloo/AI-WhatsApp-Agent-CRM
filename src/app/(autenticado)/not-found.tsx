import type { Metadata } from "next";
import { NotFoundPanel } from "@/app/_components/error-panel";

export const metadata: Metadata = {
  title: "Página no encontrada — AI WhatsApp Agent CRM",
};

// La 404 dentro del marco, con el menú (brief-29.2, D-3): la que muestra una sección de una
// capacidad que la organización no tiene. Sin este archivo, notFound() caía en el de la raíz, fuera
// del layout autenticado.
export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <NotFoundPanel />
    </main>
  );
}
