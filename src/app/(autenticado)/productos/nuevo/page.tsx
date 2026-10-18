import type { Metadata } from "next";
import {
  getVariantFormOptions,
  listProductSuggestions,
} from "@/modules/catalog";
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
// recibe el aviso, no el formulario. Presentación de la 15.4 (brief-15.4). Desde la 29.2, con la
// capacidad variants, el modelo y los atributos; ?modelo=<id> lo elige de entrada, desde la ficha
// del modelo (brief-29.2, D-4).
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const suggestions = await listProductSuggestions(context);
  const variantOptions = await getVariantFormOptions(context);
  const query = await searchParams;
  const requestedModel = Array.isArray(query.modelo)
    ? query.modelo[0]
    : query.modelo;
  const modelId = variantOptions?.models.some(
    (model) => model.id === requestedModel,
  )
    ? requestedModel!
    : "";

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
          variantOptions={variantOptions}
          variantValues={{ modelId, attributes: {} }}
        />
      </div>
    </main>
  );
}
