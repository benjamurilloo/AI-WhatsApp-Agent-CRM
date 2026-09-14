import { logoutAction } from "@/app/_auth/logout";
import { requireSession } from "@/app/_auth/session";
import { secondaryButtonClass } from "@/app/_components/form-styles";

// Página protegida provisional (brief-3.5, D-6). La Fase 7 la reemplaza por el dashboard.
export default async function HomePage() {
  await requireSession();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">AI WhatsApp Agent CRM</h1>
      <p>Sesión iniciada.</p>
      <form action={logoutAction}>
        <button type="submit" className={secondaryButtonClass}>
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
