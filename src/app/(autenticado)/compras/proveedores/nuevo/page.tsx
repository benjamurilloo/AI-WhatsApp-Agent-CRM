import type { Metadata } from "next";
import { authorize } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = {
  title: "Nuevo proveedor — AI WhatsApp Agent CRM",
};

const TITLE = "Nuevo proveedor";

// Alta de proveedor (brief-22.2, D-9): solo admin. Un viewer que entre por la URL recibe el aviso,
// no el formulario.
export default async function NewSupplierPage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/compras/proveedores" label="Volver a proveedores" />
      <DetailHeader
        title={TITLE}
        subtitle="Registrá a quién le comprás mercadería."
      />
      <div className="mt-6">
        <SupplierForm mode="crear" />
      </div>
    </main>
  );
}
