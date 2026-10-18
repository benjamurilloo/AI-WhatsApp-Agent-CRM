import type { Metadata } from "next";
import { NotFoundPanel } from "@/app/_components/error-panel";

export const metadata: Metadata = {
  title: "Página no encontrada — AI WhatsApp Agent CRM",
};

// Una dirección que no existe, en castellano y con el camino al inicio (brief-23.2, D-4).
export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <NotFoundPanel />
    </main>
  );
}
