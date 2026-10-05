import type { Metadata } from "next";
import { authorize } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { ClientForm } from "../client-form";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Nuevo cliente — AI WhatsApp Agent CRM",
};

const TITLE = "Nuevo cliente";

// Alta de cliente (pantalla 6, FR-CLI-01): solo admin. Un viewer que entre por la URL recibe el
// aviso, no el formulario. Presentación de la 15.4 (brief-15.4).
export default async function NewClientPage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/clientes" label="Volver a clientes" />
      <DetailHeader
        title={TITLE}
        subtitle="Registrá un nuevo cliente en el sistema."
      />
      <div className="mt-6">
        <ClientForm mode="crear" />
      </div>
    </main>
  );
}
