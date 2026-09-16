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
import { ClientForm } from "../client-form";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Nuevo cliente — AI WhatsApp Agent CRM",
};

const TITLE = "Nuevo cliente";

// Alta de cliente (pantalla 6, FR-CLI-01): solo admin. Un viewer que entre por la URL recibe el
// aviso, no el formulario.
export default async function NewClientPage() {
  const context = await requireSession();
  if (!authorize(context, { role: "admin" }).ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p>
        <Link href="/clientes" className={linkClass}>
          Volver a clientes
        </Link>
      </p>
      <h1 className={`mt-4 ${pageTitleClass}`}>{TITLE}</h1>
      <div className={`mt-6 ${cardClass} p-6`}>
        <ClientForm mode="crear" />
      </div>
    </main>
  );
}
