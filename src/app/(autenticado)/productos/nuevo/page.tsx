import type { Metadata } from "next";
import Link from "next/link";
import { authorize } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  linkClass,
  pageTitleClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";
import { ProductForm } from "../product-form";

export const metadata: Metadata = {
  title: "Nuevo producto — AI WhatsApp Agent CRM",
};

const TITLE = "Nuevo producto";

// Alta de producto (pantalla 3, FR-PROD-01): solo admin. Un viewer que entre por la URL
// recibe el aviso, no el formulario.
export default async function NewProductPage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p>
        <Link href="/productos" className={linkClass}>
          Volver a productos
        </Link>
      </p>
      <h1 className={`mt-4 ${pageTitleClass}`}>{TITLE}</h1>
      <div className={`mt-6 ${cardClass} p-6`}>
        <ProductForm mode="crear" />
      </div>
    </main>
  );
}
