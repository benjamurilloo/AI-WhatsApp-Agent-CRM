import type { Metadata } from "next";
import { listKnowledgeCategories } from "@/modules/knowledge";
import { authorize } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { BackLink, DetailHeader } from "@/app/_components/detail-header";
import { PageNotice } from "@/app/_components/page-notice";
import { KnowledgeForm } from "../knowledge-form";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Nueva entrada — AI WhatsApp Agent CRM",
};

const TITLE = "Nueva entrada";

// Alta de una entrada de información del negocio (FR-INFO-01): solo admin. Un viewer que entre
// por la URL recibe el aviso, no el formulario. Presentación de la 15.4 (brief-15.4).
export default async function NewKnowledgePage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const categories = await listKnowledgeCategories(context);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href="/informacion" label="Volver a información del negocio" />
      <DetailHeader
        title={TITLE}
        subtitle="Creá una entrada para mantener actualizada la información del negocio."
      />
      <div className="mt-6">
        <KnowledgeForm
          mode="crear"
          categories={categories.ok ? categories.categories : []}
        />
      </div>
    </main>
  );
}
