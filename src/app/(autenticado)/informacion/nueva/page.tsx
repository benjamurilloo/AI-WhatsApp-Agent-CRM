import type { Metadata } from "next";
import Link from "next/link";
import { listKnowledgeCategories } from "@/modules/knowledge";
import { authorize } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  linkClass,
  pageTitleClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { KnowledgeForm } from "../knowledge-form";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Nueva entrada — AI WhatsApp Agent CRM",
};

const TITLE = "Nueva entrada";

// Alta de una entrada de información del negocio (FR-INFO-01): solo admin. Un viewer que entre
// por la URL recibe el aviso, no el formulario.
export default async function NewKnowledgePage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const categories = await listKnowledgeCategories(context);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <p>
        <Link href="/informacion" className={linkClass}>
          Volver a información del negocio
        </Link>
      </p>
      <h1 className={`mt-4 ${pageTitleClass}`}>{TITLE}</h1>
      <div className={`mt-6 ${cardClass} p-6`}>
        <KnowledgeForm
          mode="crear"
          categories={categories.ok ? categories.categories : []}
        />
      </div>
    </main>
  );
}
