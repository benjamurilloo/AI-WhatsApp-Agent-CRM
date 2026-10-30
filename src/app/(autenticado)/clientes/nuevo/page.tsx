import type { Metadata } from "next";
import { listClientFilterOptions, PROVINCES } from "@/modules/crm";
import { authorize, hasCapability } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { ClientForm, type ClientFormOptions } from "../client-form";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Nuevo cliente — AI WhatsApp Agent CRM",
};

const TITLE = "Nuevo cliente";

// Alta de cliente (pantalla 6, FR-CLI-01): solo admin. Un viewer que entre por la URL recibe el
// aviso, no el formulario. Presentación de la 15.4 (brief-15.4); desde la 24.4.2, como 02 de la v2,
// con el panel «Antes de guardar» a la derecha (brief-24.4.2, D-7).
export default async function NewClientPage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const found = await listClientFilterOptions(context);
  const options: ClientFormOptions = {
    provinces: Object.entries(PROVINCES),
    segments: found.ok ? found.segments : [],
    tradeIns: await hasCapability(context.organizationId, "trade_ins"),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/clientes" label="Volver a clientes" />
      <DetailHeader
        title={TITLE}
        subtitle="Guardá los datos básicos; completá el resto cuando lo necesites."
      />
      <div className="mt-6">
        <ClientForm mode="crear" options={options} />
      </div>
    </main>
  );
}
