import { requireSession } from "@/app/_auth/session";
import { pageTitleClass } from "@/app/_components/form-styles";

// Página protegida provisional (brief-3.5, D-6). La Fase 7 la reemplaza por el dashboard.
// El cierre de sesión pasó al marco común (brief-3.7, D-7).
export default async function HomePage() {
  await requireSession();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className={pageTitleClass}>AI WhatsApp Agent CRM</h1>
      <p className="mt-4 text-muted">Sesión iniciada.</p>
    </main>
  );
}
