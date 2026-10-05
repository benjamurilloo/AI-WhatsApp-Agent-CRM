import type { Metadata } from "next";
import { listProductSuggestions } from "@/modules/catalog";
import { authorize } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { ProductForm } from "../product-form";

export const metadata: Metadata = {
  title: "Nuevo producto — AI WhatsApp Agent CRM",
};

const TITLE = "Nuevo producto";

// Alta de producto (pantalla 3, FR-PROD-01): solo admin. Un viewer que entre por la URL
// recibe el aviso, no el formulario. Presentación de la 15.4 (brief-15.4).
export default async function NewProductPage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const suggestions = await listProductSuggestions(context);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/productos" label="Volver a productos" />
      <DetailHeader
        title={TITLE}
        subtitle="Completá la información del producto para agregarlo al catálogo."
      />
      <div className="mt-6">
        <ProductForm
          mode="crear"
          suggestions={suggestions.ok ? suggestions : undefined}
        />
      </div>
    </main>
  );
}
